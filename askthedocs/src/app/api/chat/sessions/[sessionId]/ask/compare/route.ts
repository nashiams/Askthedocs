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
    const { technology, lastQuery } = await req.json();

    if (!technology || !lastQuery) {
      return NextResponse.json(
        { error: "Technology and lastQuery are required" },
        { status: 400 }
      );
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

    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      userId: userEmail,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Save user's compare request as a message
    const userMessage: Message = {
      _id: new ObjectId(),
      sessionId: new ObjectId(sessionId),
      role: "user",
      content: `Compare with ${technology}: ${lastQuery}`,
      query: `Compare with ${technology}`,
      timestamp: new Date(),
    };
    await messages.insertOne(userMessage);

    // Get snippets from session's docs for context
    let currentTechSnippets: SnippetSearchResult[] = [];
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      const searchResults = await embeddingService.searchSnippets(lastQuery, 3);
      currentTechSnippets = searchResults.filter((s) =>
        session.indexedDocs.some(
          (docUrl) => s.baseUrl === docUrl || s.sourceUrl?.startsWith(docUrl)
        )
      );
    }

    // Get the technology name from the docs
    const currentTech =
      currentTechSnippets[0]?.docName || "the current technology";

    // Generate comparison
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Compare how ${technology} handles the same task differently from ${currentTech}.
          
          Structure:
          1. Side-by-side code comparison
          2. Key differences (bullet points)
          3. When to use which
          
          Be specific and practical. Show actual code differences.`,
        },
        {
          role: "user",
          content: `The user asked: "${lastQuery}"
          
          In ${currentTech}, the approach is:
          ${currentTechSnippets.map((s) => `\`\`\`${s.language}\n${s.code}\n\`\`\``).join("\n")}
          
          Now explain how ${technology} does it differently.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const comparison = completion.choices[0].message.content || "";
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Save comparison as assistant message
    const assistantMessage: Message = {
      _id: new ObjectId(),
      sessionId: new ObjectId(sessionId),
      role: "assistant",
      content: comparison,
      sources: currentTechSnippets.map((s) => s.sourceUrl),
      tokensUsed,
      timestamp: new Date(),
    };
    await messages.insertOne(assistantMessage);

    // Update session timestamp
    await sessions.updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({
      comparison,
      comparedWith: technology,
      originalContext: lastQuery,
      sources: currentTechSnippets.map((s) => s.sourceUrl),
      tokensUsed,
    });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { error: "Failed to generate comparison" },
      { status: 500 }
    );
  }
}
