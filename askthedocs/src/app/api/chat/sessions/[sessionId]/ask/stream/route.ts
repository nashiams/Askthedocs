import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";
import type { ChatSession, Message } from "@/types/db";
import { SnippetSearchResult } from "@/types/snippet";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Helper to search each document separately
async function searchMultipleDocs(
  query: string,
  attachedDocs: string[],
  snippetsPerDoc: number = 5
): Promise<SnippetSearchResult[]> {
  // First, get all results without filtering
  const totalLimit = Math.max(50, attachedDocs.length * snippetsPerDoc * 4);
  const allResults = await embeddingService.searchSnippets(query, totalLimit);
  
  console.log(`Total search results: ${allResults.length}`);
  
  // Debug: Log unique baseUrls and sourceUrls found
  const uniqueBaseUrls = new Set(allResults.map(r => r.baseUrl).filter(Boolean));
  const uniqueSourceDomains = new Set(
    allResults
      .map(r => {
        if (r.sourceUrl) {
          try {
            return new URL(r.sourceUrl).hostname;
          } catch {
            return null;
          }
        }
        return null;
      })
      .filter(Boolean)
  );
  
  console.log('Unique baseUrls found:', Array.from(uniqueBaseUrls));
  console.log('Unique source domains:', Array.from(uniqueSourceDomains));
  
  // Group results by document with improved matching
  const resultsByDoc = new Map<string, SnippetSearchResult[]>();
  const unmatchedResults: SnippetSearchResult[] = [];
  
  for (const result of allResults) {
    // Find which attached doc this result belongs to
    let matched = false;
    
    for (const docUrl of attachedDocs) {
      // Try multiple matching strategies
      const docDomain = new URL(docUrl).hostname;
      const docPathStart = new URL(docUrl).pathname;
      
      // Check various matching conditions
      const isMatch = 
        // Exact baseUrl match
        result.baseUrl === docUrl ||
        // SourceUrl starts with docUrl
        result.sourceUrl?.startsWith(docUrl) ||
        // Domain match in sourceUrl
        (result.sourceUrl && result.sourceUrl.includes(docDomain)) ||
        // BaseUrl contains the domain
        (result.baseUrl && result.baseUrl.includes(docDomain)) ||
        // Check if baseUrl starts with a variation of docUrl
        (result.baseUrl && docUrl.startsWith(result.baseUrl)) ||
        // Partial path matching
        (result.sourceUrl && docPathStart && result.sourceUrl.includes(docPathStart));
      
      if (isMatch) {
        if (!resultsByDoc.has(docUrl)) {
          resultsByDoc.set(docUrl, []);
        }
        resultsByDoc.get(docUrl)!.push(result);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      unmatchedResults.push(result);
    }
  }
  
  // Log unmatched results for debugging
  if (unmatchedResults.length > 0) {
    console.log(`Unmatched results: ${unmatchedResults.length}`);
    console.log('Sample unmatched:', unmatchedResults.slice(0, 2).map(r => ({
      baseUrl: r.baseUrl,
      sourceUrl: r.sourceUrl?.substring(0, 50)
    })));
  }
  
  // Take top snippets from each document
  const balancedSnippets: SnippetSearchResult[] = [];
  
  for (const docUrl of attachedDocs) {
    const docResults = resultsByDoc.get(docUrl) || [];
    const topFromDoc = docResults
      .sort((a, b) => b.score - a.score)
      .slice(0, snippetsPerDoc);
    balancedSnippets.push(...topFromDoc);
    
    // If no results for a doc, log it
    if (docResults.length === 0) {
      console.log(`WARNING: No results found for ${new URL(docUrl).hostname}`);
    }
  }
  
  console.log(`Search distribution:`, 
    Object.fromEntries(
      Array.from(resultsByDoc.entries()).map(([doc, results]) => 
        [new URL(doc).hostname, results.length]
      )
    )
  );
  
  return balancedSnippets;
}

// Helper to identify which doc a query is asking about
function identifyTargetDocs(
  query: string,
  attachedDocs: string[]
): { targetDocs: string[], confidence: number } {
  if (attachedDocs.length <= 1) {
    return { targetDocs: attachedDocs, confidence: 1 };
  }

  const queryLower = query.toLowerCase();
  const docIdentifiers = attachedDocs.map(url => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '').replace('.github.io', '');
      
      // Extract identifiers from domain and path
      const parts = [
        domain.split('.')[0], // e.g., "immerjs" -> "immer"
        ...urlObj.pathname.split('/').filter(p => p && p !== 'docs')
      ];
      
      // Special handling for common patterns
      const identifiers = parts.map(p => {
        // Remove common suffixes
        return p.replace(/js$/, '').replace(/dev$/, '').replace(/io$/, '');
      }).filter(p => p.length > 2); // Filter out very short parts
      
      return {
        url,
        identifiers: [...new Set(identifiers)],
        domain
      };
    } catch {
      return { url, identifiers: [], domain: url };
    }
  });

  // Check if query mentions specific docs
  const mentionedDocs = docIdentifiers.filter(doc => 
    doc.identifiers.some(id => {
      // Check for word boundaries to avoid false matches
      const regex = new RegExp(`\\b${id}\\b`, 'i');
      return regex.test(queryLower);
    })
  );

  if (mentionedDocs.length > 0) {
    console.log(`Query mentions: ${mentionedDocs.map(d => d.identifiers).flat().join(', ')}`);
    return {
      targetDocs: mentionedDocs.map(d => d.url),
      confidence: 0.9
    };
  }

  // If no specific mention, search all docs
  return {
    targetDocs: attachedDocs,
    confidence: 0.3
  };
}
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 200 });
}
export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
     console.log("POST function called");
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sessionId } = params;
    const requestData = await req.json();
    let { query } = requestData;
    const { model = "gpt-4o-mini" } = requestData;

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
    const confirmWords = ["yes", "yeah", "yep", "sure", "ok", "okay", "y"];
    const isConfirmation = confirmWords.includes(query.toLowerCase().trim());
    
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

    // Get snippets from attached docs
    let snippets: SnippetSearchResult[] = [];
    const docCoverage = new Map<string, number>(); // Track snippets per doc
    
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      // Identify which docs to prioritize
      const { targetDocs, confidence } = identifyTargetDocs(
        query,
        session.indexedDocs
      );

      console.log(`Searching ${session.indexedDocs.length} docs for: "${query}"`);
      console.log(`Target docs (confidence ${confidence}):`, targetDocs);

      if (confidence > 0.7 && targetDocs.length < session.indexedDocs.length) {
        // High confidence about specific docs - focus on those
        snippets = await searchMultipleDocs(query, targetDocs, 8);
        
        // Add a few from other docs for context
        const otherDocs = session.indexedDocs.filter(d => !targetDocs.includes(d));
        if (otherDocs.length > 0) {
          const otherSnippets = await searchMultipleDocs(query, otherDocs, 2);
          snippets.push(...otherSnippets);
        }
      } else {
        // Search all docs equally
        const snippetsPerDoc = Math.max(3, Math.floor(15 / session.indexedDocs.length));
        snippets = await searchMultipleDocs(query, session.indexedDocs, snippetsPerDoc);
      }

      // Track coverage
      for (const snippet of snippets) {
        const docUrl = session.indexedDocs.find(
          doc => snippet.baseUrl === doc || snippet.sourceUrl?.startsWith(doc)
        ) || 'unknown';
        docCoverage.set(docUrl, (docCoverage.get(docUrl) || 0) + 1);
      }

      // Filter by score and sort
      snippets = snippets
        .filter(s => s.score > 0.45) // Lower threshold for multi-doc
        .sort((a, b) => b.score - a.score)
        .slice(0, 12); // Take top 12

      console.log(`Found ${snippets.length} relevant snippets`);
      console.log('Doc coverage:', Object.fromEntries(docCoverage));
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
                snippets: snippets.filter(s => s.score > 0.7).slice(0, 5),
                sources: [...new Set(snippets.map((s) => s.sourceUrl))],
                docCoverage: Object.fromEntries(docCoverage),
              })}\n\n`
            )
          );

          // Handle case when no relevant snippets found
          if (snippets.length === 0 && session.indexedDocs?.length > 0) {
            console.log('No snippets found, generating suggestions...');
            
            // Try to get ANY snippets from the docs for context
            const contextSnippets = await searchMultipleDocs(
              query.split(' ').slice(0, 2).join(' '), // Use first 2 words
              session.indexedDocs.slice(0, 2), // Check first 2 docs
              3
            );

            const docNames = session.indexedDocs.map(url => {
              try {
                const u = new URL(url);
                return u.hostname.replace('www.', '').split('.')[0];
              } catch {
                return 'documentation';
              }
            });

            const suggestionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `The user asked: "${query}"
                  
                  Available documentation sources: ${docNames.join(', ')}
                  Sample topics from docs: ${contextSnippets.map(s => s.heading).join(', ')}
                  
                  The query doesn't match well. Suggest 1-2 better questions that ARE likely covered.
                  Be specific to the actual documentation available.
                  
                  Return JSON: { suggestions: ["question1", "question2"], explanation: "brief reason" }`,
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
            } catch (e) {
              console.error('Failed to parse suggestion:', e);
            }

            if (suggestion?.suggestions?.length > 0) {
              const primarySuggestion = suggestion.suggestions[0];
              const message = `I couldn't find specific information about "${query}" in the attached documentation (${docNames.join(', ')}).\n\n**Did you mean:**\n• "${primarySuggestion}"${suggestion.suggestions[1] ? `\n• "${suggestion.suggestions[1]}"` : ''}\n\n${suggestion.explanation || 'These topics are covered in your documentation.'}\n\nReply with "yes" to search for the first suggestion.`;
              
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
            } else {
              // Fallback message if no suggestions generated
              const message = `I couldn't find relevant information about "${query}" in the attached documentation. The documentation covers ${docNames.join(' and ')}. Could you rephrase your question or ask about something specific to these tools?`;
              
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
          }

          // No documentation attached
          if (!session.indexedDocs?.length) {
            const message = "Please attach documentation to this chat first. You can add documentation URLs to get started.";
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

          // Build context with clear source attribution
          const contextByDoc = new Map<string, string[]>();
          
          for (const snippet of snippets) {
            const docUrl = session.indexedDocs.find(
              doc => snippet.baseUrl === doc || snippet.sourceUrl?.startsWith(doc)
            );
            
            if (docUrl) {
              if (!contextByDoc.has(docUrl)) {
                contextByDoc.set(docUrl, []);
              }
              
              let snippetText = '';
              if (snippet.content && snippet.content.length > 50) {
                snippetText = `[${snippet.heading}](${snippet.sourceUrl})\n${snippet.content}`;
              } else if (snippet.code) {
                snippetText = `[${snippet.heading}](${snippet.sourceUrl})\n\`\`\`${snippet.language || ''}\n${snippet.code}\n\`\`\``;
              }
              
              if (snippetText) {
                contextByDoc.get(docUrl)!.push(snippetText);
              }
            }
          }
          
          // Build context with clear separation between sources
          let context = '';
          const sourcesUsed: string[] = [];
          
          for (const [docUrl, snippetTexts] of contextByDoc) {
            const docName = new URL(docUrl).hostname.replace('www.', '').split('.')[0];
            sourcesUsed.push(docName);
            context += `\n## From ${docName}:\n${snippetTexts.join('\n\n')}\n`;
          }

          // Stream the response
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `You are a documentation assistant with access to multiple documentation sources.
                
                Currently available sources: ${sourcesUsed.join(', ')}
                
                IMPORTANT: 
                - Be clear about which documentation/tool you're referencing
                - If the question is about a specific tool, focus on that tool's documentation
                - Don't mix up concepts between different tools
                
                STRUCTURE YOUR ANSWER:
                  1. Direct solution first
                  2. Big Picture (2-3 lines max)
                  3. WHERE THIS GOES - specify file location
                  4. Code example with key parts highlighted
                  5. What you'll see - actual output/errors
                  
                  No emojis in code, Keep answers concise and accurate to the specific documentation.`,
              },
              {
                role: "user",
                content: `Question: ${query}\n\nDocumentation context:${context}`,
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

          const comparisonsResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a tech comparison assistant. Based on the user's question and the documentation context, identify what TYPE of technology/tool they are asking about, then suggest 2-3 SIMILAR alternatives.

          IMPORTANT: 
          - Focus on the main technology/tool being discussed, not peripheral concepts
          - If asking about pricing/features of Tool X, suggest competitors to Tool X
          - If asking about a method in Library Y, suggest similar libraries
          - Return ONLY a JSON array of strings with the alternative names

          Examples:
          - User asks about "Firecrawl pricing" → ["Apify", "Scrapy Cloud", "Bright Data"]
          - User asks about "React useState" → ["Vue.js", "Svelte", "Angular"]
          - User asks about "Stripe payment flow" → ["PayPal", "Square", "Braintree"]`,
              },
              {
                role: "user",
                content: `Original question: ${query}

          Documentation sources being used: ${sourcesUsed.join(', ')}

          Based on the context, what is the MAIN technology/tool being discussed? Suggest 2-3 direct competitors or alternatives to THAT specific tool.`,
              },
            ],
            temperature: 0.3, // Lower temperature for more consistent results
            max_tokens: 50,
          });

          let comparisons = [];
          try {
            const text = comparisonsResponse.choices[0].message.content || "[]";
            comparisons = JSON.parse(
              text.replace(/```json\n?|```\n?/g, "").trim()
            );
            
            // Validate that we got an array of strings
            if (!Array.isArray(comparisons) || comparisons.some(c => typeof c !== 'string')) {
              console.error('Invalid comparisons format:', comparisons);
              comparisons = [];
            }
          } catch (e) {
            console.error('Failed to parse comparisons:', e);
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
            docCoverage: Object.fromEntries(docCoverage),
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