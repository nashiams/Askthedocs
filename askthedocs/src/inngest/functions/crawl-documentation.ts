// Updated section of crawl-documentation.ts

import { inngest } from "../client";
import { updateIndexedDocStatus } from "@/lib/db/collections";
import { embeddingService } from "@/lib/vector/embeddings";
import { getDatabase } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { ExtractedSnippet } from "@/types/snippet";
import Ably from "ably";
import { discoverViaSitemap, discoverViaHtmlScraping } from "./lib/sitemap-discovery";
import { firecrawlClient } from "./lib/firecrawl-client";
import { 
  extractCodeFromHtml, 
  extractCodeFromMarkdown 
} from "./lib/manual-crawler";

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
      // Step 1: Discover pages via sitemap (unchanged)
      const pages = await step.run("discover-pages", async () => {
        console.log(`Starting crawl for ${url}`);
        
        let foundPages = await discoverViaSitemap(url);
        
        if (foundPages.length === 0) {
          console.log('No sitemap found, falling back to HTML scraping');
          foundPages = await discoverViaHtmlScraping(url);
        }
        
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

      // Step 2: Extract content with SEMANTIC EXTRACTION
      let allSnippets: ExtractedSnippet[] = [];
      let firecrawlCount = 0;
      let manualCount = 0;
      let semanticExtractionCount = 0;
      let fallbackExtractionCount = 0;
      
      for (let i = 0; i < pages.length; i++) {
        const pageUrl = pages[i];
        
        const snippets = await step.run(`extract-page-${i}`, async () => {
          try {
            const result = await firecrawlClient.scrapePage(pageUrl);
            
            if (!result) {
              console.log(`Skipping ${pageUrl} - failed to fetch`);
              return [];
            }
            
            // Track extraction methods
            if (result.method === 'firecrawl') {
              firecrawlCount++;
            } else {
              manualCount++;
            }
            
            let pageSnippets: ExtractedSnippet[] = [];
            
            // IMPROVED: Use semantic extraction based on content type
            if (result.contentType === 'markdown') {
              console.log(`Using semantic markdown extraction for ${pageUrl}`);
              
              // Use the correct function name
              pageSnippets = extractCodeFromMarkdown(result.content, pageUrl, url);
              semanticExtractionCount++;
              
            } else {
              // HTML content
              console.log(`Using semantic HTML extraction for ${pageUrl}`);
              
              // Use the correct function name
              pageSnippets = extractCodeFromHtml(result.content, pageUrl, url);
              semanticExtractionCount++;
            }
            
            // Update progress with more detailed info
            const progress = 10 + Math.round(((i + 1) / pages.length) * 60);
            await channel.publish("progress", {
              jobId,
              status: "crawling",
              message: `Processed ${i + 1}/${pages.length} pages (${result.method}:${result.contentType}, ${pageSnippets.length} sections)`,
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

      // Enhanced logging
      console.log(`Extraction complete:`);
      console.log(`- Firecrawl pages: ${firecrawlCount}`);
      console.log(`- Manual pages: ${manualCount}`);
      console.log(`- Semantic extractions: ${semanticExtractionCount}`);
      console.log(`- Fallback extractions: ${fallbackExtractionCount}`);
      console.log('API key usage:', firecrawlClient.getStats());

      // Deduplicate snippets with improved logic
      const originalCount = allSnippets.length;
      allSnippets = deduplicateSnippets(allSnippets);
      console.log(`Deduplication: ${originalCount} → ${allSnippets.length} snippets`);

      // Step 3: Generate embeddings and store (enhanced with extraction stats)
      await step.run("store-embeddings", async () => {
        if (allSnippets.length === 0) {
          console.warn("No content found, marking as complete anyway");
          
          await channel.publish("progress", {
            jobId,
            status: "complete",
            message: "No documentation content found",
            percentage: 100,
            sessionId,
            stats: {
              pages: pages.length,
              snippets: 0,
              baseUrl: url,
              firecrawlPages: firecrawlCount,
              manualPages: manualCount,
              semanticExtractions: semanticExtractionCount,
              fallbackExtractions: fallbackExtractionCount,
            },
          });
          
          return;
        }

        console.log(`Storing ${allSnippets.length} semantic snippets`);

        await channel.publish("progress", {
          jobId,
          status: "embedding",
          message: `Creating embeddings for ${allSnippets.length} content sections...`,
          percentage: 85,
        });

        // Add metadata
        const snippetsWithMetadata = allSnippets.map(s => ({
          ...s,
          baseUrl: url,
          indexedBy: userEmail,
          extractionMethod: semanticExtractionCount > fallbackExtractionCount ? 'semantic' : 'mixed',
        }));

        await embeddingService.embedAndStoreSnippets(snippetsWithMetadata);

        // Update MongoDB with enhanced stats
        const db = await getDatabase();
        
        await db.collection("indexed_urls").updateOne(
          { jobId },
          { 
            $set: { 
              status: 'complete',
              snippetsCount: allSnippets.length,
              crawlMethod: manualCount > 0 ? 'mixed' : 'firecrawl',
              firecrawlPages: firecrawlCount,
              manualPages: manualCount,
              semanticExtractions: semanticExtractionCount,
              fallbackExtractions: fallbackExtractionCount,
              extractionQuality: semanticExtractionCount > fallbackExtractionCount ? 'high' : 'medium',
            }
          },
          { upsert: true }
        );

        // Attach to session
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
          message: `Successfully indexed ${allSnippets.length} content sections with ${semanticExtractionCount > fallbackExtractionCount ? 'high' : 'medium'} quality extraction!`,
          percentage: 100,
          sessionId,
          stats: {
            pages: pages.length,
            snippets: allSnippets.length,
            baseUrl: url,
            firecrawlPages: firecrawlCount,
            manualPages: manualCount,
            semanticExtractions: semanticExtractionCount,
            fallbackExtractions: fallbackExtractionCount,
            extractionQuality: semanticExtractionCount > fallbackExtractionCount ? 'high' : 'medium',
          },
        });

        console.log(`Crawl complete: ${allSnippets.length} sections indexed`);
        console.log(`Quality: ${semanticExtractionCount}/${semanticExtractionCount + fallbackExtractionCount} pages used semantic extraction`);
      });

      return {
        success: true,
        pages: pages.length,
        snippets: allSnippets.length,
        firecrawlPages: firecrawlCount,
        manualPages: manualCount,
        semanticExtractions: semanticExtractionCount,
        fallbackExtractions: fallbackExtractionCount,
      };
      
    } catch (error) {
      console.error("Crawl failed:", error);
      
      // Update status to failed (unchanged)
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

// Enhanced deduplication
function deduplicateSnippets(snippets: ExtractedSnippet[]): ExtractedSnippet[] {
  const MAX_SNIPPETS = 500;
  
  if (snippets.length <= MAX_SNIPPETS) {
    return snippets;
  }
  
  console.log(`Deduplicating ${snippets.length} snippets...`);
  
  const uniqueSnippets: ExtractedSnippet[] = [];
  const seenContent = new Set<string>();
  
  // Sort by importance (semantic extractions first, then by content length)
  const sortedSnippets = snippets.sort((a, b) => {
    // Prefer longer content (more context)
    if (a.code.length !== b.code.length) {
      return b.code.length - a.code.length;
    }
    // Prefer certain section types
    const importantSections = ['Installation', 'Getting Started', 'API Reference', 'Guide'];
    const aImportant = importantSections.includes(a.section);
    const bImportant = importantSections.includes(b.section);
    
    if (aImportant !== bImportant) {
      return bImportant ? 1 : -1;
    }
    
    return 0;
  });
  
  for (const snippet of sortedSnippets) {
    // Create a more sophisticated deduplication key
    const contentKey = snippet.code
      .replace(/\s+/g, " ")
      .substring(0, 200)
      .toLowerCase();
    
    if (!seenContent.has(contentKey)) {
      uniqueSnippets.push(snippet);
      seenContent.add(contentKey);
      
      if (uniqueSnippets.length >= MAX_SNIPPETS) {
        break;
      }
    }
  }
  
  console.log(`After smart deduplication: ${uniqueSnippets.length} unique snippets`);
  return uniqueSnippets;
}