// inngest/functions/crawl-documentation.ts
import { inngest } from "../client";
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
      // Step 1: Discover ALL documentation pages
      const pages = await step.run("discover-pages", async () => {
        console.log(`Starting crawl for ${url}`);

        const baseUrl = new URL(url);
        const visited = new Set<string>();
        const toVisit = [url];
        const foundPages: string[] = [];
        const maxPages = 50; // Limit for MVP

        while (toVisit.length > 0 && foundPages.length < maxPages) {
          const currentUrl = toVisit.shift()!;

          if (visited.has(currentUrl)) continue;
          visited.add(currentUrl);

          try {
            console.log(`Discovering links from: ${currentUrl}`);
            const response = await fetch(currentUrl);
            const html = await response.text();

            // Extract ALL links from the page
            const linkRegex = /href="([^"#]+)"/gi;
            const matches = [...html.matchAll(linkRegex)];

            for (const match of matches) {
              let link = match[1];

              // Convert relative URLs to absolute
              if (link.startsWith("/")) {
                link = `${baseUrl.origin}${link}`;
              } else if (!link.startsWith("http")) {
                // Relative path
                const currentBase = currentUrl.substring(
                  0,
                  currentUrl.lastIndexOf("/")
                );
                link = `${currentBase}/${link}`;
              }

              // Only include links from same domain
              try {
                const linkUrl = new URL(link);
                if (linkUrl.origin !== baseUrl.origin) continue;

                // FILTER OUT FOREIGN LANGUAGE PAGES
                const pathname = linkUrl.pathname.toLowerCase();

                // Skip foreign language paths
                const foreignLanguagePatterns = [
                  "/zh-cn/",
                  "/zh-tw/",
                  "/ja/",
                  "/ko/",
                  "/es/",
                  "/fr/",
                  "/de/",
                  "/ru/",
                  "/pt/",
                  "/it/",
                  "/ar/",
                  "/hi/",
                  "/nl/",
                  "/pl/",
                  "/tr/",
                  "/vi/",
                  "/id/",
                  "/th/",
                  "/cs/",
                  "/da/",
                  "/fi/",
                  "/el/",
                  "/he/",
                  "/hu/",
                  "/no/",
                  "/ro/",
                  "/sk/",
                  "/sv/",
                  "/uk/",
                  "/bg/",
                ];

                if (
                  foreignLanguagePatterns.some((pattern) =>
                    pathname.includes(pattern)
                  )
                ) {
                  console.log(`Skipping foreign language page: ${link}`);
                  continue;
                }

                // Also skip if URL has language query params
                if (
                  linkUrl.search.includes("lang=") &&
                  !linkUrl.search.includes("lang=en")
                ) {
                  console.log(
                    `Skipping non-English language param page: ${link}`
                  );
                  continue;
                }

                // Filter for documentation-like URLs
                const isDocLike =
                  pathname.includes("/docs") ||
                  pathname.includes("/guide") ||
                  pathname.includes("/api") ||
                  pathname.includes("/reference") ||
                  pathname.includes("/tutorial") ||
                  pathname.includes("/manual") ||
                  pathname.includes("/documentation");

                if (
                  isDocLike &&
                  !visited.has(link) &&
                  !toVisit.includes(link)
                ) {
                  toVisit.push(link);
                }
              } catch {
                // Invalid URL, skip
              }
            }

            // Add current page to found pages
            foundPages.push(currentUrl);
          } catch (error) {
            console.error(`Failed to fetch ${currentUrl}:`, error);
          }
        }

        console.log(`Found ${foundPages.length} documentation pages`);

        // Update status
        await channel.publish("progress", {
          jobId,
          status: "crawling",
          message: `Found ${foundPages.length} pages to index`,
          totalPages: foundPages.length,
        });

        return foundPages;
      });

      // Step 2: Extract content from each page
      let allSnippets: ExtractedSnippet[] = [];

      for (let i = 0; i < pages.length; i++) {
        const pageUrl = pages[i];

        const snippets = await step.run(`extract-page-${i}`, async () => {
          try {
            console.log(`Extracting from ${pageUrl}`);
            const response = await fetch(pageUrl);
            const html = await response.text();

            // Extract code blocks with multiple patterns
            const codePatterns = [
              /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
              /<code[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/code>/gi,
              /<div[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
              /```[\w]*\n([\s\S]*?)```/g,
            ];

            const pageSnippets: ExtractedSnippet[] = [];
            const baseUrl = new URL(url);
            const docName = baseUrl.hostname.replace("www.", "").split(".")[0];

            for (const pattern of codePatterns) {
              const matches = [...html.matchAll(pattern)];

              for (const match of matches) {
                const code = match[1]
                  .replace(/<[^>]*>/g, "") // Remove HTML tags
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">")
                  .replace(/&amp;/g, "&")
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&#x27;/g, "'")
                  .trim();

                if (code.length > 20 && code.length < 2000) {
                  // Try to find purpose from heading
                  const beforeCode = html.substring(
                    Math.max(0, match.index! - 1000),
                    match.index!
                  );

                  // Look for various heading patterns
                  const headingPatterns = [
                    /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i,
                    /<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
                    /<strong[^>]*>([^<]+)<\/strong>/i,
                  ];

                  let purpose = "Code example";
                  for (const headingPattern of headingPatterns) {
                    const headingMatch = beforeCode.match(headingPattern);
                    if (headingMatch) {
                      purpose = headingMatch[1].trim();
                      break;
                    }
                  }

                  // Detect language from class names or content
                  let language = "javascript";
                  const langMatch = html
                    .substring(match.index! - 100, match.index!)
                    .match(/language-(\w+)/);
                  if (langMatch) {
                    language = langMatch[1];
                  }

                  pageSnippets.push({
                    code,
                    language,
                    purpose: purpose.substring(0, 200),
                    sourceUrl: pageUrl,
                    docName: docName.charAt(0).toUpperCase() + docName.slice(1),
                    section: "Documentation",
                    warning: undefined,
                  });
                }
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

      // APPLY SNIPPET LIMITS AND DEDUPLICATION
      const MAX_SNIPPETS = 500; // Reasonable limit for MVP

      if (allSnippets.length > MAX_SNIPPETS) {
        console.log(
          `Limiting from ${allSnippets.length} to ${MAX_SNIPPETS} snippets`
        );

        // Deduplicate by code similarity first
        const uniqueSnippets: ExtractedSnippet[] = [];
        const seenCodes = new Set<string>();

        for (const snippet of allSnippets) {
          // Simple deduplication by first 100 chars of code (normalized)
          const codeKey = snippet.code.replace(/\s+/g, "").substring(0, 100);
          if (!seenCodes.has(codeKey)) {
            uniqueSnippets.push(snippet);
            seenCodes.add(codeKey);
          }
        }

        console.log(
          `After deduplication: ${uniqueSnippets.length} unique snippets`
        );

        // Take first MAX_SNIPPETS unique ones
        allSnippets = uniqueSnippets.slice(0, MAX_SNIPPETS);
      }

      // Step 3: Generate embeddings and store
      await step.run("store-embeddings", async () => {
        if (allSnippets.length === 0) {
          console.warn("No code snippets found, but continuing...");

          await channel.publish("progress", {
            jobId,
            status: "complete",
            message: "No code examples found in documentation",
            stats: {
              pages: pages.length,
              snippets: 0,
              baseUrl: url,
            },
          });

          return;
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
          message: `Successfully indexed ${allSnippets.length} code examples from ${pages.length} pages!`,
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
