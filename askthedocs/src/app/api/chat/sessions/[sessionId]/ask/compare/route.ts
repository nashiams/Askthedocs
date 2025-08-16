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

// Helper to search each document separately (same as ask route)
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
    const { technology, lastQuery, model = "gpt-4o-mini" } = await req.json();

    if (!technology || !lastQuery) {
      return new Response("Technology and lastQuery are required", { status: 400 });
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

    // Save user's compare request as a message
    const userMessage: Message = {
      _id: new ObjectId(),
      sessionId: new ObjectId(sessionId),
      role: "user",
      content: `Compare with ${technology}: ${lastQuery}`,
      query: `Compare with ${technology}: ${lastQuery}`,
      timestamp: new Date(),
    };
    await messages.insertOne(userMessage);

    // Get snippets from attached docs
    let snippets: SnippetSearchResult[] = [];
    const docCoverage = new Map<string, number>(); // Track snippets per doc
    
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      console.log(`Searching ${session.indexedDocs.length} docs for comparison: "${lastQuery}"`);
      
      // Search for relevant snippets from current docs
      const snippetsPerDoc = Math.max(3, Math.floor(10 / session.indexedDocs.length));
      snippets = await searchMultipleDocs(lastQuery, session.indexedDocs, snippetsPerDoc);
      
      // Track coverage
      for (const snippet of snippets) {
        const docUrl = session.indexedDocs.find(
          doc => snippet.baseUrl === doc || snippet.sourceUrl?.startsWith(doc)
        ) || 'unknown';
        docCoverage.set(docUrl, (docCoverage.get(docUrl) || 0) + 1);
      }

      // Filter by score and sort
      snippets = snippets
        .filter(s => s.score > 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8); // Take top 8 for comparison

      console.log(`Found ${snippets.length} relevant snippets for comparison`);
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
                comparedWith: technology,
              })}\n\n`
            )
          );

          // Handle case when no documentation attached
          if (!session.indexedDocs?.length) {
            const message = "Please attach documentation to this chat first. You need documentation to compare against.";
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

          // Get the current technology name from the docs
          const currentTech = sourcesUsed[0] || "the current technology";

          // Stream the comparison response
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `You are a technical documentation assistant comparing how different technologies handle the same task.
                
                Current documentation is from: ${sourcesUsed.join(', ')}
                User wants to compare with: ${technology}
                
                STRUCTURE YOUR COMPARISON:
                1. **${currentTech} Approach**: Brief explanation with code if shown
                2. **${technology} Approach**: How it differs with equivalent code
                3. **Key Differences**: Clear bullet points
                4. **When to Use Which**: Practical guidance
                
                Be specific and practical. Show actual code differences when relevant.
                Keep the comparison balanced and objective.`,
              },
              {
                role: "user",
                content: `Original question: "${lastQuery}"
                
                Current implementation context from ${currentTech}:${context}
                
                Now explain how ${technology} handles this differently. Include code examples where appropriate.`,
              },
            ],
            temperature: 0.4,
            max_tokens: 2000,
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
              `data: ${JSON.stringify({ 
                type: "done", 
                tokensUsed, 
                model,
                comparedWith: technology 
              })}\n\n`
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

          // Update session timestamp
          await sessions.updateOne(
            { _id: new ObjectId(sessionId) },
            { $set: { updatedAt: new Date() } }
          );

        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: "Failed to generate comparison" })}\n\n`
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
    console.error("Compare stream error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}