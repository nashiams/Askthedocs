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

// Helper to identify which doc a query is asking about
async function identifyTargetDocs(
  query: string,
  attachedDocs: string[]
): Promise<{ targetDocs: string[], confidence: number }> {
  if (attachedDocs.length <= 1) {
    return { targetDocs: attachedDocs, confidence: 1 };
  }

  // Extract doc identifiers from URLs
  const docIdentifiers = attachedDocs.map(url => {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '').replace('.github.io', '');
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    // Extract key identifiers (e.g., "immer" from immerjs.github.io, "firecrawl" from docs.firecrawl.dev)
    const identifiers = [
      domain.split('.')[0], // First part of domain
      ...pathParts.slice(0, 2) // First couple path segments
    ].filter(p => p && p !== 'docs' && p !== 'api' && p !== 'guide');
    
    return {
      url,
      identifiers: [...new Set(identifiers)],
      domain
    };
  });

  // Check if query mentions specific docs
  const queryLower = query.toLowerCase();
  const mentionedDocs = docIdentifiers.filter(doc => 
    doc.identifiers.some(id => queryLower.includes(id.toLowerCase()))
  );

  if (mentionedDocs.length > 0) {
    return {
      targetDocs: mentionedDocs.map(d => d.url),
      confidence: 0.9
    };
  }

  // If no specific mention, search all docs
  return {
    targetDocs: attachedDocs,
    confidence: 0.5
  };
}

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
    let { query, model = "gpt-4o-mini" } = await req.json();

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

    // Check if user is confirming a suggestion
    const isConfirmation = ["yes", "yeah", "yep", "sure", "ok", "okay"]
      .includes(query.toLowerCase().trim());
    
    if (isConfirmation) {
      const lastMessage = await messages.findOne(
        { 
          sessionId: new ObjectId(sessionId),
          role: "assistant"
        },
        { sort: { timestamp: -1 } }
      );

      if (lastMessage?.suggestedQuery) {
        query = lastMessage.suggestedQuery;
        console.log(`User confirmed suggestion, using query: ${query}`);
      }
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

    // Identify which docs to search
    const { targetDocs, confidence } = await identifyTargetDocs(
      query,
      session.indexedDocs || []
    );

    console.log(`Query: "${query}"`);
    console.log(`Target docs (confidence ${confidence}):`, targetDocs);

    // Get snippets from attached docs
    let snippets: SnippetSearchResult[] = [];
    let snippetsByDoc: Map<string, SnippetSearchResult[]> = new Map();
    
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      // Search for snippets - increase limit for multiple docs
      const searchLimit = Math.max(20, session.indexedDocs.length * 10);
      const searchResults = await embeddingService.searchSnippets(query, searchLimit);
      
      // Group snippets by document
      for (const snippet of searchResults) {
        const docUrl = session.indexedDocs.find(
          doc => snippet.baseUrl === doc || snippet.sourceUrl?.startsWith(doc)
        );
        
        if (docUrl) {
          if (!snippetsByDoc.has(docUrl)) {
            snippetsByDoc.set(docUrl, []);
          }
          snippetsByDoc.get(docUrl)!.push(snippet);
        }
      }

      // Build final snippet list based on target docs
      if (targetDocs.length > 0 && confidence > 0.7) {
        // High confidence - focus on target docs
        for (const docUrl of targetDocs) {
          const docSnippets = snippetsByDoc.get(docUrl) || [];
          snippets.push(
            ...docSnippets
              .filter(s => s.score > 0.45) // Lower threshold for targeted search
              .slice(0, 5)
          );
        }
      } else {
        // Low confidence or multiple targets - get from all docs
        const snippetsPerDoc = Math.max(3, Math.floor(12 / session.indexedDocs.length));
        
        for (const [docUrl, docSnippets] of snippetsByDoc) {
          // Take top snippets from each doc
          const topFromDoc = docSnippets
            .filter(s => s.score > 0.5)
            .slice(0, snippetsPerDoc);
          
          snippets.push(...topFromDoc);
        }
        
        // Sort all by score and take top
        snippets.sort((a, b) => b.score - a.score);
        snippets = snippets.slice(0, 10);
      }

      console.log(`Found ${snippets.length} relevant snippets from ${snippetsByDoc.size} docs`);
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
                snippets: snippets.filter(s => s.score > 0.75),
                sources: [...new Set(snippets.map((s) => s.sourceUrl))],
                searchedDocs: targetDocs,
              })}\n\n`
            )
          );

          // Handle case when no relevant snippets found
          if (snippets.length === 0 && session.indexedDocs?.length > 0) {
            // Generate context-aware suggestions
            const docContexts = [];
            for (const [docUrl, docSnippets] of snippetsByDoc) {
              const sections = docSnippets
                .slice(0, 5)
                .map(s => s.section)
                .join(", ");
              
              const docName = new URL(docUrl).hostname.replace('www.', '').split('.')[0];
              docContexts.push(`${docName}: ${sections}`);
            }

            const suggestionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `The user asked: "${query}"
                  
                  Available documentation:
                  ${docContexts.join('\n')}
                  
                  The query doesn't match the docs well. Suggest 1-2 better questions that ARE covered.
                  Return JSON: { suggestions: ["question1", "question2"], explanation: "brief reason" }
                  
                  Make suggestions specific to the actual doc content.`,
                },
                {
                  role: "user",
                  content: query,
                },
              ],
              temperature: 0.3,
              max_tokens: 200,
            });

            let suggestion = null;
            try {
              const content = suggestionResponse.choices[0].message.content || "{}";
              suggestion = JSON.parse(content.replace(/```json\n?|```\n?/g, "").trim());
            } catch {
              suggestion = null;
            }

            if (suggestion?.suggestions?.length > 0) {
              const primarySuggestion = suggestion.suggestions[0];
              const message = `I couldn't find specific information about "${query}" in the attached documentation.\n\n**Did you mean:**\n• "${primarySuggestion}"${suggestion.suggestions[1] ? `\n• "${suggestion.suggestions[1]}"` : ''}\n\n${suggestion.explanation}\n\nReply with "yes" to search for the first suggestion.`;
              
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

              await messages.insertOne({
                _id: new ObjectId(),
                sessionId: new ObjectId(sessionId),
                role: "assistant",
                content: message,
                suggestedQuery: primarySuggestion,
                tokensUsed: 0,
                timestamp: new Date(),
              });

              controller.close();
              return;
            }
          }

          // No documentation attached
          if (!session.indexedDocs?.length) {
            const message = "Please attach documentation to this chat first.";
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

          // Build context with source attribution
          const contextParts = [];
          const docsUsed = new Set<string>();
          
          for (const snippet of snippets) {
            const docUrl = session.indexedDocs.find(
              doc => snippet.baseUrl === doc || snippet.sourceUrl?.startsWith(doc)
            );
            if (docUrl) {
              docsUsed.add(new URL(docUrl).hostname);
            }
            
            if (snippet.content && snippet.content.length > 50) {
              contextParts.push(`[${snippet.section}](${snippet.sourceUrl})\n${snippet.content}`);
            } else if (snippet.code) {
              contextParts.push(`[${snippet.section}](${snippet.sourceUrl})\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\``);
            }
          }
          
          const context = contextParts.join('\n\n---\n\n');

          // Add note about which docs were searched
          const docsNote = docsUsed.size > 1 
            ? `\n\nSearching across: ${Array.from(docsUsed).join(', ')}`
            : docsUsed.size === 1
            ? `\n\nSource: ${Array.from(docsUsed)[0]}`
            : '';

          // Stream the response
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `You are a documentation assistant helping developers understand code.
                
                You have access to multiple documentation sources. Always cite which documentation you're referencing.
                ${docsNote}
          
                STRUCTURE YOUR ANSWER:
                1. Direct solution first (mention which doc if multiple)
                2. Big Picture (2-3 lines max)
                3. WHERE THIS GOES - specify file location and which project/doc
                4. Code example with key parts highlighted
                5. What you'll see - actual output/errors
                
                Keep it concise. Be clear about which documentation you're citing from.`,
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
            searchedDocs: targetDocs,
            tokensUsed,
            timestamp: new Date(),
          });

          // Update session title if needed
          if (session.title === "New Chat") {
            const title = query.substring(0, 50) + (query.length > 50 ? "..." : "");
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