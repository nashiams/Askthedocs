import { NextRequest } from "next/server";
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
      return new Response("Unauthorized", { status: 401 });
    }

    const { sessionId } = params;
    const { query, model = "gpt-4o-mini" } = await req.json();

    if (!query?.trim()) {
      return new Response("Query is required", { status: 400 });
    }

    if (!ObjectId.isValid(sessionId)) {
      return new Response("Invalid session ID", { status: 400 });
    }

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");
    const messages = db.collection<Message>("messages");

    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      userId: userEmail,
    });

    if (!session) {
      return new Response("Session not found", { status: 404 });
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

    // Get snippets from attached docs
    let snippets: SnippetSearchResult[] = [];
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      const searchResults = await embeddingService.searchSnippets(query, 5);
      snippets = searchResults.filter((s) =>
        session.indexedDocs.some(
          (docUrl) => s.baseUrl === docUrl || s.sourceUrl?.startsWith(docUrl)
        )
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send metadata first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "metadata",
                snippets: snippets.slice(0, 3),
                sources: [...new Set(snippets.map((s) => s.sourceUrl))],
              })}\n\n`
            )
          );

          if (snippets.length === 0) {
            const message = session.indexedDocs?.length
              ? "I couldn't find relevant information in the attached documentation."
              : "Please attach documentation to this chat first.";

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: message })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", tokensUsed: 0 })}\n\n`
              )
            );

            // Save message
            await messages.insertOne({
              _id: new ObjectId(),
              sessionId: new ObjectId(sessionId),
              role: "assistant",
              content: message,
              tokensUsed: 0,
              timestamp: new Date(),
            });

            controller.close();
            return;
          }

          const context = snippets
            .map(
              (s) =>
                `[Source: ${s.sourceUrl}]\n${s.purpose}\n\`\`\`${s.language}\n${s.code}\n\`\`\``
            )
            .join("\n\n---\n\n");

          // Stream the response
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a documentation assistant. Structure: 1) Direct solution 2) Big Picture 3) WHERE THIS GOES 4) Code example 5) Output/errors. Be concise.",
              },
              {
                role: "user",
                content: `Question: ${query}\n\nDocumentation:\n${context}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 1500,
            stream: true,
          });

          let fullAnswer = "";
          let buffer = "";

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullAnswer += content;
              buffer += content;

              if (buffer.length > 50 || buffer.includes("\n")) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "chunk", content: buffer })}\n\n`
                  )
                );
                buffer = "";
              }
            }
          }

          if (buffer) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: buffer })}\n\n`
              )
            );
          }

          // Get comparisons
          const comparisonsResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "Suggest 2-3 similar technologies. Return ONLY JSON array.",
              },
              {
                role: "user",
                content: `Learning about: ${query.substring(0, 100)}`,
              },
            ],
            temperature: 0.5,
            max_tokens: 50,
          });

          let comparisons = [];
          try {
            const text = comparisonsResponse.choices[0].message.content || "[]";
            comparisons = JSON.parse(
              text.replace(/```json\n?|```\n?/g, "").trim()
            );
          } catch (e) {
            comparisons = [];
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "comparisons", comparisons })}\n\n`
            )
          );

          const tokensUsed = Math.floor(fullAnswer.length / 4);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", tokensUsed, model })}\n\n`
            )
          );

          // Save assistant message
          await messages.insertOne({
            _id: new ObjectId(),
            sessionId: new ObjectId(sessionId),
            role: "assistant",
            content: fullAnswer,
            sources: [...new Set(snippets.map((s) => s.sourceUrl))],
            tokensUsed,
            timestamp: new Date(),
          });

          // Update session
          if (session.title === "New Chat") {
            const title =
              query.substring(0, 50) + (query.length > 50 ? "..." : "");
            await sessions.updateOne(
              { _id: new ObjectId(sessionId) },
              { $set: { title, updatedAt: new Date() } }
            );
          } else {
            await sessions.updateOne(
              { _id: new ObjectId(sessionId) },
              { $set: { updatedAt: new Date() } }
            );
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: "Failed to generate response" })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stream session ask error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
