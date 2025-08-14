import type { ExtractedSnippet } from "@/types/snippet";

export function extractCodeFromHtml(html: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  const codePatterns = [
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    /<code[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/code>/gi,
    /<div[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*code[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<pre[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/pre>/gi,
  ];
  
  const pageSnippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  for (const pattern of codePatterns) {
    const matches = [...html.matchAll(pattern)];
    
    for (const match of matches) {
      const code = match[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();
      
      if (code.length > 20 && code.length < 2000) {
        const beforeCode = html.substring(
          Math.max(0, match.index! - 1000),
          match.index!
        );
        
        const headingPatterns = [
          /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i,
          /<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
          /<strong[^>]*>([^<]+)<\/strong>/i,
        ];
        
        let purpose = "Code example";
        for (const headingPattern of headingPatterns) {
          const headingMatch = beforeCode.match(headingPattern);
          if (headingMatch) {
            purpose = headingMatch[1]
              .replace(/<[^>]*>/g, "")
              .trim();
            break;
          }
        }
        
        // Detect language
        let language = "javascript";
        const langMatch = html
          .substring(Math.max(0, match.index! - 200), match.index!)
          .match(/language-(\w+)|lang="(\w+)"|class="(\w+)"/);
        if (langMatch) {
          language = langMatch[1] || langMatch[2] || langMatch[3];
        }
        
        pageSnippets.push({
          code,
          language,
          purpose: purpose.substring(0, 200),
          sourceUrl: pageUrl,
          docName: docName.charAt(0).toUpperCase() + docName.slice(1),
          section: "Documentation",
        });
      }
    }
  }
  
  return pageSnippets;
}

export function extractCodeFromMarkdown(markdown: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  // Extract code blocks with language
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const language = match[1] || 'javascript';
    const code = match[2].trim();
    
    if (code.length > 20 && code.length < 2000) {
      // Try to find heading before code block
      const beforeCode = markdown.substring(Math.max(0, match.index - 500), match.index);
      const headingMatch = beforeCode.match(/#{1,6}\s+([^\n]+)/);
      const purpose = headingMatch ? headingMatch[1].trim() : 'Code example';
      
      snippets.push({
        code,
        language,
        purpose: purpose.substring(0, 200),
        sourceUrl: pageUrl,
        docName: docName.charAt(0).toUpperCase() + docName.slice(1),
        section: 'Documentation',
      });
    }
  }
  
  return snippets;
}