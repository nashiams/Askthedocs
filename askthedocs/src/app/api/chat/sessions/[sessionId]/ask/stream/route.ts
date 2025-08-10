import { NextRequest } from "next/server";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";
import { saveQuery } from "@/lib/db/collections";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { query, model = "gpt-4o-mini" } = await req.json();

    if (!query?.trim()) {
      return new Response("Query is required", { status: 400 });
    }

    // Search for relevant snippets
    const snippets = await embeddingService.searchSnippets(query, 5);

    if (snippets.length === 0) {
      return new Response(
        `data: ${JSON.stringify({
          type: "error",
          content:
            "I couldn't find relevant information in the indexed documentation.",
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      );
    }

    // Build context
    const context = snippets
      .map(
        (s) =>
          `[Source: ${s.sourceUrl}]\n${s.purpose}\n\`\`\`${s.language}\n${s.code}\n\`\`\``
      )
      .join("\n\n---\n\n");

    // Create streaming response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial data (snippets and sources)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "metadata",
                snippets: snippets.slice(0, 3),
                sources: [...new Set(snippets.map((s) => s.sourceUrl))],
              })}\n\n`
            )
          );

          // Stream the main answer
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `You are a documentation assistant helping developers who struggle with reading docs.
                
                STRUCTURE YOUR ANSWER LIKE THIS:
                
                1. **One-line answer** - Direct solution
                2. **Big Picture** (2-3 lines) - Explain the concept/flow
                3. **WHERE THIS GOES** - Specify exact file location
                4. **Code Example** with:
                   - The CRITICAL part highlighted with comments
                   - Show what happens when it works
                   - Show what error you get when it fails
                5. **What You'll See** - Show actual console output or error messages
                
                IMPORTANT RULES:
                - Point out the EXACT error name
                - Show WHERE to put code (which file/folder)
                - Include actual error output users will see
                - If uncertain, prefix with "Likely:" or "Probably:"
                - NO emojis in code comments`,
              },
              {
                role: "user",
                content: `Question: ${query}\n\nRelevant documentation:\n${context}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 1500,
            stream: true,
          });

          let fullAnswer = "";
          let buffer = "";
          let tokenCount = 0;

          // Stream chunks as they arrive - batch them for better performance
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullAnswer += content;
              buffer += content;
              tokenCount++;

              // Send buffer when it's big enough or contains a newline
              if (buffer.length > 50 || buffer.includes("\n")) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "chunk",
                      content: buffer,
                    })}\n\n`
                  )
                );
                buffer = "";
              }
            }
          }

          // Send any remaining buffer
          if (buffer) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "chunk",
                  content: buffer,
                })}\n\n`
              )
            );
          }

          // Get comparison suggestions (non-streaming) - with better prompt
          const comparisonsResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Suggest 2-3 similar technologies for comparison.
                Return ONLY a JSON array, no markdown, no explanation.
                Example response: ["mongoose","typeorm","prisma"]
                If no good comparisons exist, return empty array: []`,
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
            const comparisonsText =
              comparisonsResponse.choices[0].message.content || "[]";
            // Clean the response - remove markdown if GPT added it
            const cleanedText = comparisonsText
              .replace(/```json\n?/g, "")
              .replace(/```\n?/g, "")
              .trim();
            comparisons = JSON.parse(cleanedText);
          } catch (e) {
            console.error("Failed to parse comparisons:", e);
            comparisons = [];
          }

          // Send comparisons
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "comparisons",
                comparisons,
              })}\n\n`
            )
          );

          // Calculate actual token usage
          const tokensUsed =
            completion.usage?.total_tokens || Math.floor(tokenCount * 1.3);

          // Send completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                tokensUsed,
                model,
              })}\n\n`
            )
          );

          // Save to history (fire and forget)
          saveQuery({
            userEmail,
            query,
            answer: fullAnswer,
            snippets: snippets.slice(0, 3).map((s) => ({
              code: s.code,
              url: s.sourceUrl,
              purpose: s.purpose,
            })),
            tokensUsed,
            model,
          }).catch(console.error);
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                content: "Failed to generate response",
              })}\n\n`
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
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Ask stream error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
