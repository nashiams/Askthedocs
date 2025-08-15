import type { ExtractedSnippet } from "@/types/snippet";

export function extractSectionsFromMarkdown(
  markdown: string, 
  pageUrl: string, 
  baseUrl: string
): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  // Clean markdown from nav/footer junk
  const cleanMd = markdown
    .replace(/\[Skip to[^\]]+\][^\n]*/g, '')
    .replace(/\[!\[.*?\]\(.*?\)\][^\n]*/g, '')
    .replace(/Search``[^\n]*/g, '');
  
  // Track parent heading
  let currentH2 = '';
  let position = 0;
  
  // Split by ANY heading level
  const sections = cleanMd.split(/(?=^#{1,4}\s)/m);
  
  for (const section of sections) {
    const headingMatch = section.match(/^(#{1,4})\s+(.+)$/m);
    if (!headingMatch) continue;
    
    const level = headingMatch[1].length;
    const heading = headingMatch[2]
      .replace(/\[​\]\([^)]+\)/g, '') // Remove anchor links
      .replace(/\s*\[.*?\]\(.*?\)\s*$/, '') // Remove trailing links
      .trim();
    
    // Update parent heading
    if (level === 2) currentH2 = heading;
    
    // Get content without heading
    const contentAfterHeading = section
      .replace(/^#{1,4}\s+.+$/m, '')
      .trim();
    
    // Skip empty or navigation sections
    if (!contentAfterHeading || contentAfterHeading.length < 20) continue;
    
    // Extract code blocks
    const codeBlockRegex = /```(?:codeBlockLines_\w+|(\w+))?\n?([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(contentAfterHeading)) !== null) {
      const code = match[2].trim();
      if (code) codeBlocks.push(code);
    }
    
    // Determine type
    const hasCode = codeBlocks.length > 0;
    const hasText = contentAfterHeading.replace(/```[\s\S]*?```/g, '').trim().length > 30;
    const type = hasCode && hasText ? 'mixed' : hasCode ? 'code' : 'section';
    
    snippets.push({
      content: contentAfterHeading,
      type,
      heading,
      parentHeading: level > 2 ? currentH2 : undefined,
      level,
      codeSnippet: codeBlocks.join('\n\n') || undefined,
      sourceUrl: `${pageUrl}#${heading.toLowerCase().replace(/\s+/g, '-')}`,
      baseUrl,
      position: position++,
      docName: docName.charAt(0).toUpperCase() + docName.slice(1),
    });
  }
  
  return snippets;
}