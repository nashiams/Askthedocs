import { inngest } from "../client";
import { updateIndexedDocStatus } from "@/lib/db/collections";
import { embeddingService } from "@/lib/vector/embeddings";
import { getDatabase } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { ExtractedSnippet } from "@/types/snippet";
import Ably from "ably";
import { discoverViaSitemap, discoverViaHtmlScraping } from "./lib/sitemap-discovery";
import { firecrawlClient } from "./lib/firecrawl-client";
import {  extractSectionsFromMarkdown } from "./lib/manual-crawler";

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

export const crawlDocumentation = inngest.createFunction(
  {
    id: "crawl-documentation",
    name: "Crawl Documentation Site",
    retries: 2,
  },
  { event: "docs/crawl.requested" },
  async ({ event, step }) => {
    const { url, userEmail, jobId, sessionId } = event.data;
    const channel = ably.channels.get(`crawl-${userEmail}`);

    try {
      // Step 1: Discover pages via sitemap
      const pages = await step.run("discover-pages", async () => {
        console.log(`Starting crawl for ${url}`);
        
        // Try sitemap first
        let foundPages = await discoverViaSitemap(url);
        
        if (foundPages.length === 0) {
          console.log('No sitemap found, falling back to HTML scraping');
          foundPages = await discoverViaHtmlScraping(url);
        }
        
        // Limit to 50 pages for MVP
        foundPages = foundPages.slice(0, 50);
        
        console.log(`Found ${foundPages.length} pages to process`);
        
        await channel.publish("progress", {
          jobId,
          status: "crawling",
          message: `Found ${foundPages.length} pages to process`,
          percentage: 10,
        });
        
        return foundPages;
      });

      if (pages.length === 0) {
        throw new Error("No pages found to crawl");
      }

      // Step 2: Extract content from each page using Firecrawl with rotation
      let allSnippets: ExtractedSnippet[] = [];
      let firecrawlCount = 0;
      let manualCount = 0;
      
      for (let i = 0; i < pages.length; i++) {
        const pageUrl = pages[i];
        
        const snippets = await step.run(`extract-page-${i}`, async () => {
          try {
            // Use Firecrawl client with automatic rotation and fallback
            const result = await firecrawlClient.scrapePage(pageUrl);
            
            if (!result) {
              console.log(`Skipping ${pageUrl} - failed to fetch`);
              return [];
            }
            
            // Track which method was used
            if (result.method === 'firecrawl') {
              firecrawlCount++;
            } else {
              manualCount++;
            }
            
            let pageSnippets: ExtractedSnippet[] = [];
            
            // Check if content is markdown (from Firecrawl)
            if (result.content.includes('```') && result.method === 'firecrawl') {
              // USE SECTION EXTRACTION for better context
              pageSnippets = extractSectionsFromMarkdown(result.content, pageUrl, url);
            } else {
              // HTML content - existing logic
              pageSnippets = extractSectionsFromMarkdown(result.content, pageUrl, url);
            }
            
            // Update progress
            const progress = 10 + Math.round(((i + 1) / pages.length) * 60);
            await channel.publish("progress", {
              jobId,
              status: "crawling",
              message: `Processed ${i + 1}/${pages.length} pages`,
              percentage: progress,
            });
            
            return pageSnippets;
          } catch (error) {
            console.error(`Failed to extract from ${pageUrl}:`, error);
            return [];
          }
        });
        
        allSnippets.push(...snippets);
      }

      // Log extraction stats
      console.log(`Extraction complete - Firecrawl: ${firecrawlCount}, Manual: ${manualCount}`);
      console.log('API key usage:', firecrawlClient.getStats());

      // Deduplicate snippets
      allSnippets = deduplicateSnippets(allSnippets);

      // Step 3: Generate embeddings and store
      await step.run("store-embeddings", async () => {
        if (allSnippets.length === 0) {
          console.warn("No code snippets found, marking as complete anyway");
          
          await channel.publish("progress", {
            jobId,
            status: "complete",
            message: "No code examples found in documentation",
            percentage: 100,
            sessionId,
            stats: {
              pages: pages.length,
              snippets: 0,
              baseUrl: url,
              firecrawlPages: firecrawlCount,
              manualPages: manualCount,
            },
          });
          
          return;
        }

        console.log(`Storing ${allSnippets.length} snippets`);

        await channel.publish("progress", {
          jobId,
          status: "embedding",
          message: `Creating embeddings for ${allSnippets.length} snippets...`,
          percentage: 85,
        });

        // Add metadata
        const snippetsWithMetadata = allSnippets.map(s => ({
          ...s,
          baseUrl: url,
          indexedBy: userEmail,
        }));

        await embeddingService.embedAndStoreSnippets(snippetsWithMetadata);

        // Update MongoDB
        const db = await getDatabase();
        
        // Update indexed_urls collection
        await db.collection("indexed_urls").updateOne(
          { jobId },
          { 
            $set: { 
              status: 'complete',
              snippetsCount: allSnippets.length,
              crawlMethod: manualCount > 0 ? 'mixed' : 'firecrawl',
              firecrawlPages: firecrawlCount,
              manualPages: manualCount,
            }
          },
          { upsert: true }
        );

        // Attach to session if provided
        if (sessionId) {
          await db.collection("sessions").updateOne(
            { _id: new ObjectId(sessionId) },
            { 
              $addToSet: { indexedDocs: url },
              $set: { updatedAt: new Date() }
            }
          );
        }

        await channel.publish("progress", {
          jobId,
          status: "complete",
          message: `Successfully indexed ${allSnippets.length} code examples!`,
          percentage: 100,
          sessionId,
          stats: {
            pages: pages.length,
            snippets: allSnippets.length,
            baseUrl: url,
            firecrawlPages: firecrawlCount,
            manualPages: manualCount,
          },
        });

        console.log(`Crawl complete: ${allSnippets.length} snippets indexed`);
        console.log(`Methods used - Firecrawl: ${firecrawlCount}, Manual: ${manualCount}`);
      });

      return {
        success: true,
        pages: pages.length,
        snippets: allSnippets.length,
        firecrawlPages: firecrawlCount,
        manualPages: manualCount,
      };
      
    } catch (error) {
      console.error("Crawl failed:", error);
      
      // Update status to failed
      const db = await getDatabase();
      await db.collection("indexed_urls").updateOne(
        { jobId },
        { 
          $set: { 
            status: 'failed',
            error: error instanceof Error ? error.message : "Unknown error"
          }
        },
        { upsert: true }
      );
      
      await updateIndexedDocStatus(jobId, "failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      
      await channel.publish("progress", {
        jobId,
        status: "error",
        message: `Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      
      throw error;
    }
  }
);

// Deduplicate snippets helper
function deduplicateSnippets(snippets: ExtractedSnippet[]): ExtractedSnippet[] {
  const MAX_SNIPPETS = 500;
  
  // If under limit, return as-is
  if (snippets.length <= MAX_SNIPPETS) {
    return snippets;
  }
  
  console.log(`Deduplicating ${snippets.length} snippets...`);
  
  const uniqueSnippets: ExtractedSnippet[] = [];
  const seenContent = new Set<string>();
  
  for (const snippet of snippets) {
    // Create a unique key from the snippet content
    let uniqueKey = '';
    
    // Try different fields that might contain the unique content
    if (snippet.code && typeof snippet.code === "string") {
      uniqueKey = snippet.code.replace(/\s+/g, "").substring(0, 100);
    } else if (snippet.codeSnippet && typeof snippet.codeSnippet === "string") {
      uniqueKey = snippet.codeSnippet.replace(/\s+/g, "").substring(0, 100);
    } else if (snippet.content && typeof snippet.content === "string") {
      // Use content as fallback for uniqueness
      uniqueKey = snippet.content.replace(/\s+/g, "").substring(0, 100);
    }
    
    // Only add if we have a unique key and haven't seen it before
    if (uniqueKey && !seenContent.has(uniqueKey)) {
      uniqueSnippets.push(snippet);
      seenContent.add(uniqueKey);
      
      // Stop if we've reached the max
      if (uniqueSnippets.length >= MAX_SNIPPETS) {
        break;
      }
    } else if (!uniqueKey) {
      // If no unique key can be generated, include the snippet anyway
      uniqueSnippets.push(snippet);
      
      if (uniqueSnippets.length >= MAX_SNIPPETS) {
        break;
      }
    }
  }
  
  console.log(`After deduplication: ${uniqueSnippets.length} unique snippets`);
  return uniqueSnippets;
}