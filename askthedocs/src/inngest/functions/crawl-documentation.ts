// inngest/functions/crawl-documentation.ts - FIXED VERSION
import { inngest } from "../client";
import { redis } from "@/lib/cache/redis";
import { updateIndexedDocStatus } from "@/lib/db/collections";
import { embeddingService } from "@/lib/vector/embeddings";
import type { ExtractedSnippet } from "@/types/snippet";
import Ably from "ably";

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

export const crawlDocumentation = inngest.createFunction(
  {
    id: "crawl-documentation",
    name: "Crawl Documentation Site",
    retries: 2,
  },
  { event: "docs/crawl.requested" },
  async ({ event, step }) => {
    const { url, userEmail, jobId } = event.data;
    const channel = ably.channels.get(`crawl-${userEmail}`);
    try {
      // Step 1: Use fetch instead of Playwright for discovery
      const pages = await step.run("discover-pages", async () => {
        console.log(`Starting crawl for ${url}`);

        // Simple fetch-based discovery
        const response = await fetch(url);
        const html = await response.text();

        // Extract links with regex (not perfect but works)
        const linkRegex = /href="(\/docs\/v6\/[^"]+)"/g;
        const matches = [...html.matchAll(linkRegex)];

        const baseUrl = new URL(url);
        const foundLinks = matches
          .map((match) => `${baseUrl.origin}${match[1]}`)
          .filter((link, index, self) => self.indexOf(link) === index) // unique
          .slice(0, 20); // Limit to 20 pages for MVP

        console.log(`Found ${foundLinks.length} documentation pages`);

        // Update status
        await channel.publish("progress", {
          jobId,
          status: "crawling",
          message: `Found ${foundLinks.length} pages to index`,
          totalPages: foundLinks.length,
        });

        return foundLinks;
      });

      // Step 2: Extract content from each page
      const allSnippets: ExtractedSnippet[] = [];

      for (let i = 0; i < pages.length; i++) {
        const pageUrl = pages[i];

        const snippets = await step.run(`extract-page-${i}`, async () => {
          try {
            console.log(`Extracting from ${pageUrl}`);
            const response = await fetch(pageUrl);
            const html = await response.text();

            // Extract code blocks with regex
            const codeRegex =
              /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
            const codeMatches = [...html.matchAll(codeRegex)];

            const pageSnippets: ExtractedSnippet[] = [];

            for (const match of codeMatches) {
              const code = match[1]
                .replace(/<[^>]*>/g, "") // Remove HTML tags
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .trim();

              if (code.length > 20 && code.length < 2000) {
                // Try to find purpose from heading before code
                const beforeCode = html.substring(
                  Math.max(0, match.index! - 500),
                  match.index!
                );
                const headingMatch = beforeCode.match(
                  /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i
                );
                const purpose = headingMatch ? headingMatch[1] : "Code example";

                pageSnippets.push({
                  code,
                  language: "javascript",
                  purpose: purpose.substring(0, 200),
                  sourceUrl: pageUrl,
                  docName: "Sequelize",
                  section: "Documentation",
                  warning: undefined,
                });
              }
            }

            // Update progress
            const progress = Math.round(((i + 1) / pages.length) * 100);
            await channel.publish("progress", {
              jobId,
              status: "crawling",
              message: `Processed ${i + 1}/${pages.length} pages`,
              progress: `${i + 1}/${pages.length}`,
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

      // Step 3: Generate embeddings and store
      await step.run("store-embeddings", async () => {
        if (allSnippets.length === 0) {
          throw new Error("No code snippets found to index");
        }

        console.log(`Storing ${allSnippets.length} snippets`);

        await channel.publish("progress", {
          jobId,
          status: "embedding",
          message: `Creating embeddings for ${allSnippets.length} snippets...`,
        });

        // Add required fields for embedding service
        const snippetsWithMetadata = allSnippets.map((s) => ({
          ...s,
          baseUrl: url,
          indexedBy: userEmail,
        }));

        const result =
          await embeddingService.embedAndStoreSnippets(snippetsWithMetadata);

        // Update database
        await updateIndexedDocStatus(jobId, "complete", {
          pagesIndexed: pages.length,
          snippetsStored: allSnippets.length,
        });

        // Send completion message
        await channel.publish("progress", {
          jobId,
          status: "complete",
          message: `Successfully indexed ${allSnippets.length} code examples!`,
          stats: {
            pages: pages.length,
            snippets: allSnippets.length,
            baseUrl: url,
          },
        });

        console.log(`Crawl complete: ${allSnippets.length} snippets indexed`);
      });

      return {
        success: true,
        pages: pages.length,
        snippets: allSnippets.length,
      };
    } catch (error) {
      console.error("Crawl failed:", error);

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
