import { ExtractedSnippet } from "@/types/snippet";
import { chromium, Browser, Page } from "playwright";

export class SnippetExtractor {
  private browser: Browser | null = null;

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async extractFromUrl(
    url: string,
    docName: string
  ): Promise<ExtractedSnippet[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const snippets: ExtractedSnippet[] = [];

    try {
      await page.goto(url, { waitUntil: "networkidle" });

      // Extract all code blocks with context
      const rawSnippets = await page.evaluate(() => {
        const codeBlocks = Array.from(
          document.querySelectorAll("pre code, .highlight, .code-block")
        );

        return codeBlocks.map((block) => {
          // Get the code content
          const code = (block as HTMLElement).innerText || "";

          // Find language from class names
          const classes = block.className;
          const langMatch = classes.match(/language-(\w+)/);
          const language = langMatch ? langMatch[1] : "javascript";

          // Get surrounding context (heading above code)
          let purpose = "";
          let section = "";
          let current = block.closest("section, article, div");

          if (current) {
            const heading = current.querySelector("h1, h2, h3, h4");
            if (heading) {
              purpose = (heading as HTMLElement).innerText;
              section = purpose;
            }

            // Try to find the immediate preceding paragraph
            const prevElement = block.parentElement?.previousElementSibling;
            if (prevElement && prevElement.tagName === "P") {
              purpose = (prevElement as HTMLElement).innerText.slice(0, 200);
            }
          }

          // Get the exact URL with anchor
          const nearestId = block.closest("[id]")?.id;
          const fullUrl = nearestId
            ? `${window.location.href.split("#")[0]}#${nearestId}`
            : window.location.href;

          // Look for warnings/notes near the code
          let warning = "";
          const nextElement = block.parentElement?.nextElementSibling;
          if (
            nextElement &&
            (nextElement.className.includes("warning") ||
              nextElement.className.includes("note") ||
              nextElement.textContent?.toLowerCase().includes("note:"))
          ) {
            warning = (nextElement as HTMLElement).innerText.slice(0, 150);
          }

          return {
            code,
            language,
            purpose,
            section,
            sourceUrl: fullUrl,
            warning,
          };
        });
      });

      // Filter and clean snippets
      for (const raw of rawSnippets) {
        if (raw.code && raw.code.length > 10 && raw.code.length < 2000) {
          snippets.push({
            ...raw,
            docName,
            code: raw.code.trim(),
            purpose: raw.purpose || "Code example",
          });
        }
      }
    } catch (error) {
      console.error(`Failed to extract from ${url}:`, error);
    } finally {
      await page.close();
    }

    return snippets;
  }

  async crawlDocumentation(
    baseUrl: string,
    docName: string,
    maxPages: number = 10
  ): Promise<ExtractedSnippet[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const visited = new Set<string>();
    const toVisit = [baseUrl];
    const allSnippets: ExtractedSnippet[] = [];

    while (toVisit.length > 0 && visited.size < maxPages) {
      const url = toVisit.shift()!;
      if (visited.has(url)) continue;

      visited.add(url);
      console.log(`Extracting from: ${url}`);

      const snippets = await this.extractFromUrl(url, docName);
      allSnippets.push(...snippets);

      // Find more documentation links
      try {
        await page.goto(url, { waitUntil: "networkidle" });
        const links = await page.evaluate((base) => {
          const baseUrl = new URL(base);
          return Array.from(
            document.querySelectorAll('a[href*="docs"], a[href*="guide"]')
          )
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => href.startsWith(baseUrl.origin))
            .slice(0, 5);
        }, baseUrl);

        for (const link of links) {
          if (!visited.has(link)) {
            toVisit.push(link);
          }
        }
      } catch (error) {
        console.error(`Failed to find links on ${url}:`, error);
      }
    }

    await page.close();
    return allSnippets;
  }
}
