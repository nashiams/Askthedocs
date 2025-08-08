import { inngest } from "../client";
import { chromium } from "playwright";
import { embeddingService } from "@/lib/vector/embeddings";
import { redis } from "@/lib/cache/redis";
import { updateIndexedDocStatus } from "@/lib/db/collections";
import { ExtractedSnippet } from "@/types/snippet";

export const crawlDocumentation = inngest.createFunction(
  {
    id: "crawl-documentation",
    name: "Crawl Documentation Site",
    timeouts: { finish: "15m" }, // 15 minutes max
  },
  { event: "docs/crawl.requested" },
  async ({ event, step }) => {
    const { url, userEmail, jobId } = event.data;

    try {
      // Step 1: Discover all pages
      const pages = await step.run("discover-pages", async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: "networkidle" });

        // Find all documentation links
        const links = await page.evaluate((baseUrl) => {
          const base = new URL(baseUrl);
          const docLinks = Array.from(document.querySelectorAll("a[href]"))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => {
              try {
                const u = new URL(href);
                // Only include same domain and under /docs path
                return (
                  u.origin === base.origin &&
                  (u.pathname.includes("/docs") ||
                    u.pathname.includes("/guide"))
                );
              } catch {
                return false;
              }
            });

          return [...new Set(docLinks)]; // Remove duplicates
        }, url);

        await browser.close();

        // Notify discovery complete
        await redis.publish(
          `crawl-${userEmail}`,
          JSON.stringify({
            jobId,
            status: "crawling",
            progress: `Found ${links.length} pages to index`,
            totalPages: links.length,
          })
        );

        return links;
      });

      // Step 2: Crawl each page in batches
      const batchSize = 5;
      const allSnippets: ExtractedSnippet[] = [];

      for (let i = 0; i < pages.length; i += batchSize) {
        const batch = pages.slice(i, i + batchSize);

        const snippets = await step.run(`crawl-batch-${i}`, async () => {
          const browser = await chromium.launch({ headless: true });
          const batchSnippets: ExtractedSnippet[] = [];

          for (const pageUrl of batch) {
            try {
              const page = await browser.newPage();
              await page.goto(pageUrl, {
                waitUntil: "networkidle",
                timeout: 30000,
              });

              // Extract code snippets and content
              const extracted = await page.evaluate(() => {
                const snippets: ExtractedSnippet[] = [];
                const codeBlocks = document.querySelectorAll(
                  "pre code, .highlight, .code-block"
                );

                codeBlocks.forEach((block) => {
                  const code = (block as HTMLElement).innerText;
                  if (code && code.length > 20 && code.length < 2000) {
                    // Get context
                    let purpose = "Code example";
                    const section = block.closest(
                      'section, article, [class*="content"]'
                    );
                    if (section) {
                      const heading = section.querySelector("h1, h2, h3");
                      if (heading) {
                        purpose = (heading as HTMLElement).innerText;
                      }
                    }

                    // Get language
                    const classes = block.className;
                    const langMatch = classes.match(/language-(\w+)/);
                    const language = langMatch ? langMatch[1] : "javascript";

                    snippets.push({
                      code: code.trim(),
                      language,
                      purpose: purpose.slice(0, 200),
                      sourceUrl: window.location.href,
                      docName: "",
                      section: "",
                    });
                  }
                });

                return snippets;
              });

              batchSnippets.push(
                ...extracted.map((s) => ({
                  ...s,
                  baseUrl: url,
                  docName: new URL(url).hostname.replace("www.", ""),
                  indexedBy: userEmail,
                }))
              );

              await page.close();
            } catch (error) {
              console.error(`Failed to crawl ${pageUrl}:`, error);
            }
          }

          await browser.close();

          // Update progress
          await redis.publish(
            `crawl-${userEmail}`,
            JSON.stringify({
              jobId,
              status: "crawling",
              progress: `Processed ${Math.min(i + batchSize, pages.length)}/${pages.length} pages`,
              percentage: Math.round(((i + batchSize) / pages.length) * 100),
            })
          );

          return batchSnippets;
        });

        allSnippets.push(...snippets);
      }

      // Step 3: Generate embeddings and store
      await step.run("store-embeddings", async () => {
        if (allSnippets.length === 0) {
          throw new Error("No snippets found to index");
        }

        await redis.publish(
          `crawl-${userEmail}`,
          JSON.stringify({
            jobId,
            status: "embedding",
            message: `Creating embeddings for ${allSnippets.length} code snippets...`,
          })
        );

        // Store in Qdrant with embeddings
        const result =
          await embeddingService.embedAndStoreSnippets(allSnippets);

        // Update database status
        await updateIndexedDocStatus(jobId, "complete", {
          pagesIndexed: pages.length,
          snippetsStored: allSnippets.length,
          tokensUsed: result.totalTokens,
        });

        // Notify completion
        await redis.publish(
          `crawl-${userEmail}`,
          JSON.stringify({
            jobId,
            status: "complete",
            message: `Successfully indexed ${pages.length} pages with ${allSnippets.length} code examples!`,
            stats: {
              pages: pages.length,
              snippets: allSnippets.length,
              baseUrl: url,
            },
          })
        );
      });

      return {
        success: true,
        pages: pages.length,
        snippets: allSnippets.length,
      };
    } catch (error) {
      console.error("Crawl error:", error);

      // Update status to failed
      await updateIndexedDocStatus(jobId, "failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Notify failure
      await redis.publish(
        `crawl-${userEmail}`,
        JSON.stringify({
          jobId,
          status: "error",
          message: `Failed to index documentation: ${error instanceof Error ? error.message : String(error)}`,
        })
      );

      throw error;
    }
  }
);
