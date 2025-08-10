import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";
import type { ChatSession, Message } from "@/types/db";
import { SnippetSearchResult } from "@/types/snippet";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = params;
    const { query, model = "gpt-4o-mini" } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!ObjectId.isValid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");
    const messages = db.collection<Message>("messages");

    // Get session and verify ownership
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      userId: userEmail,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Save user message
    const userMessage: Message = {
      _id: new ObjectId(),
      sessionId: new ObjectId(sessionId),
      role: "user",
      content: query,
      query: query,
      timestamp: new Date(),
    };
    await messages.insertOne(userMessage);

    // Search only within session's attached docs
    let snippets: SnippetSearchResult[] = [];
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      const searchResults = await embeddingService.searchSnippets(query, 5);
      // Filter to only include snippets from attached docs
      snippets = searchResults.filter((s) =>
        session.indexedDocs.some(
          (docUrl) => s.baseUrl === docUrl || s.sourceUrl?.startsWith(docUrl)
        )
      );
    }

    if (snippets.length === 0) {
      const noResultsMessage = session.indexedDocs?.length
        ? "I couldn't find relevant information in the attached documentation."
        : "Please attach documentation to this chat first.";

      // Save assistant message even for no results
      const assistantMessage: Message = {
        _id: new ObjectId(),
        sessionId: new ObjectId(sessionId),
        role: "assistant",
        content: noResultsMessage,
        tokensUsed: 0,
        timestamp: new Date(),
      };
      await messages.insertOne(assistantMessage);

      return NextResponse.json({
        answer: noResultsMessage,
        snippets: [],
        sources: [],
        comparisons: [],
      });
    }

    // Build context
    const context = snippets
      .map(
        (s) =>
          `[Source: ${s.sourceUrl}]\n${s.purpose}\n\`\`\`${s.language}\n${s.code}\n\`\`\``
      )
      .join("\n\n---\n\n");

    // Generate answer
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a documentation assistant helping developers understand code.
          
          STRUCTURE YOUR ANSWER:
          1. Direct solution first
          2. Big Picture (2-3 lines max)
          3. WHERE THIS GOES - specify file location
          4. Code example with key parts highlighted
          5. What you'll see - actual output/errors
          
          Keep it concise. Point out exact error names. No emojis in code.`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nRelevant documentation:\n${context}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const answer = completion.choices[0].message.content || "";
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Get comparison suggestions
    const comparisonsResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Suggest 2-3 similar technologies. Return ONLY JSON array, no markdown.",
        },
        {
          role: "user",
          content: `User is learning about: ${query.substring(0, 100)}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 50,
    });

    let comparisons = [];
    try {
      const text = comparisonsResponse.choices[0].message.content || "[]";
      comparisons = JSON.parse(text.replace(/```json\n?|```\n?/g, "").trim());
    } catch (e) {
      comparisons = [];
    }

    // Save assistant message
    const assistantMessage: Message = {
      _id: new ObjectId(),
      sessionId: new ObjectId(sessionId),
      role: "assistant",
      content: answer,
      sources: [...new Set(snippets.map((s) => s.sourceUrl))],
      tokensUsed,
      timestamp: new Date(),
    };
    await messages.insertOne(assistantMessage);

    // Update session title if it's still "New Chat"
    if (session.title === "New Chat") {
      const title = query.substring(0, 50) + (query.length > 50 ? "..." : "");
      await sessions.updateOne(
        { _id: new ObjectId(sessionId) },
        { $set: { title, updatedAt: new Date() } }
      );
    } else {
      // Just update timestamp
      await sessions.updateOne(
        { _id: new ObjectId(sessionId) },
        { $set: { updatedAt: new Date() } }
      );
    }

    return NextResponse.json({
      answer,
      snippets: snippets.slice(0, 3),
      sources: [...new Set(snippets.map((s) => s.sourceUrl))],
      comparisons,
      tokensUsed,
      model,
    });
  } catch (error) {
    console.error("Session ask error:", error);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 }
    );
  }
}
