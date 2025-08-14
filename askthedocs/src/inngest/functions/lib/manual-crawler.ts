import type { ExtractedSnippet } from "@/types/snippet";

interface DocumentSection {
  heading: string;
  content: string;
  level: number;
  startIndex: number;
  endIndex: number;
}

export function extractCodeFromHtml(html: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  // First try semantic chunking approach
  const semanticSnippets = extractSemanticSections(html, pageUrl, baseUrl);
  if (semanticSnippets.length > 0) {
    return semanticSnippets;
  }
  
  // Fallback to old method for very simple pages
  return extractIsolatedCodeBlocks(html, pageUrl, baseUrl);
}

export function extractCodeFromMarkdown(markdown: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  return extractSemanticSectionsFromMarkdown(markdown, pageUrl, baseUrl);
}

function extractSemanticSectionsFromMarkdown(markdown: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  // Split markdown into sections by headings
  const sections = splitMarkdownIntoSections(markdown);
  
  for (const section of sections) {
    const sectionSnippets = processMarkdownSection(section, pageUrl, baseUrl, docName);
    snippets.push(...sectionSnippets);
  }
  
  return snippets;
}

function splitMarkdownIntoSections(markdown: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = markdown.split('\n');
  let currentSection: DocumentSection | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endIndex = i;
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        content: '',
        level: headingMatch[1].length,
        startIndex: i,
        endIndex: lines.length
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }
  
  // Add final section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

function processMarkdownSection(section: DocumentSection, pageUrl: string, baseUrl: string, docName: string): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const content = section.content.trim();
  
  if (content.length === 0) return snippets;
  
  // Check if this section contains code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks = [...content.matchAll(codeBlockRegex)];
  
  if (codeBlocks.length === 0) {
    // No code blocks, but might be important contextual content
    if (isImportantSection(section.heading, content)) {
      snippets.push({
        code: content,
        language: 'text',
        purpose: section.heading,
        sourceUrl: pageUrl,
        docName: docName.charAt(0).toUpperCase() + docName.slice(1),
        section: categorizeSection(section.heading),
      });
    }
    return snippets;
  }
  
  // Section has code blocks - create comprehensive snippets
  for (const match of codeBlocks) {
    const language = match[1] || detectLanguage(match[2]);
    const code = match[2].trim();
    
    if (code.length < 10 || code.length > 3000) continue;
    
    // Get context around the code block
    const beforeCode = content.substring(0, match.index || 0).trim();
    const afterCode = content.substring((match.index || 0) + match[0].length).trim();
    
    // Create rich context
    let contextualContent = section.heading + '\n\n';
    if (beforeCode) contextualContent += beforeCode + '\n\n';
    contextualContent += `\`\`\`${language}\n${code}\n\`\`\``;
    if (afterCode.length > 0 && afterCode.length < 500) {
      contextualContent += '\n\n' + afterCode.substring(0, 500);
    }
    
    snippets.push({
      code: contextualContent, // Store the full context, not just code
      language,
      purpose: section.heading,
      sourceUrl: pageUrl,
      docName: docName.charAt(0).toUpperCase() + docName.slice(1),
      section: categorizeSection(section.heading),
    });
  }
  
  return snippets;
}

function extractSemanticSections(html: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  // Find all main content sections
  const sections = findHtmlSections(html);
  
  for (const section of sections) {
    const sectionSnippets = processHtmlSection(section, pageUrl, baseUrl, docName);
    snippets.push(...sectionSnippets);
  }
  
  return snippets;
}

function findHtmlSections(html: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  
  // Remove script and style tags
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // Find headings and their content
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const headings: Array<{level: number, text: string, index: number}> = [];
  
  let match;
  while ((match = headingRegex.exec(cleanHtml)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: match[2].replace(/<[^>]*>/g, '').trim(),
      index: match.index + match[0].length
    });
  }
  
  // Create sections between headings
  for (let i = 0; i < headings.length; i++) {
    const currentHeading = headings[i];
    const nextHeading = headings[i + 1];
    
    const startIndex = currentHeading.index;
    const endIndex = nextHeading ? nextHeading.index : cleanHtml.length;
    
    const sectionHtml = cleanHtml.substring(startIndex, endIndex);
    const sectionText = htmlToText(sectionHtml);
    
    if (sectionText.trim().length > 50) {
      sections.push({
        heading: currentHeading.text,
        content: sectionText,
        level: currentHeading.level,
        startIndex,
        endIndex
      });
    }
  }
  
  return sections;
}

function processHtmlSection(section: DocumentSection, pageUrl: string, baseUrl: string, docName: string): ExtractedSnippet[] {
  const snippets: ExtractedSnippet[] = [];
  const content = section.content;
  
  // Look for code blocks in this section
  const codePatterns = [
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    /<code[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/code>/gi,
    /<div[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];
  
  let hasCodeBlocks = false;
  
  for (const pattern of codePatterns) {
    const matches = [...section.content.matchAll(pattern)];
    
    for (const match of matches) {
      hasCodeBlocks = true;
      const code = cleanCodeBlock(match[1]);
      
      if (code.length < 10 || code.length > 3000) continue;
      
      const language = detectLanguage(code);
      
      // Create contextual snippet with surrounding text
      const contextualContent = createContextualContent(section, code, language);
      
      snippets.push({
        code: contextualContent,
        language,
        purpose: section.heading,
        sourceUrl: pageUrl,
        docName: docName.charAt(0).toUpperCase() + docName.slice(1),
        section: categorizeSection(section.heading),
      });
    }
  }
  
  // If no code blocks but important section, include as text
  if (!hasCodeBlocks && isImportantSection(section.heading, content)) {
    snippets.push({
      code: content.substring(0, 2000),
      language: 'text',
      purpose: section.heading,
      sourceUrl: pageUrl,
      docName: docName.charAt(0).toUpperCase() + docName.slice(1),
      section: categorizeSection(section.heading),
    });
  }
  
  return snippets;
}

function createContextualContent(section: DocumentSection, code: string, language: string): string {
  const textContent = htmlToText(section.content);
  const heading = section.heading;
  
  // Find text before and after the code
  const codeIndex = textContent.indexOf(code.substring(0, 50));
  const beforeText = codeIndex > 0 ? textContent.substring(0, codeIndex).trim() : '';
  const afterText = codeIndex > 0 ? textContent.substring(codeIndex + code.length).trim() : '';
  
  let contextualContent = heading + '\n\n';
  
  // Add before context (up to 300 chars)
  if (beforeText && beforeText.length > 20) {
    contextualContent += beforeText.substring(Math.max(0, beforeText.length - 300)) + '\n\n';
  }
  
  // Add the code block
  contextualContent += `\`\`\`${language}\n${code}\n\`\`\``;
  
  // Add after context (up to 200 chars)
  if (afterText && afterText.length > 20) {
    contextualContent += '\n\n' + afterText.substring(0, 200);
  }
  
  return contextualContent;
}

function isImportantSection(heading: string, content: string): boolean {
  const importantKeywords = [
    'install', 'setup', 'getting started', 'quickstart', 'introduction',
    'overview', 'configuration', 'api', 'usage', 'example', 'tutorial',
    'guide', 'reference', 'authentication', 'authorization', 'deployment'
  ];
  
  const headingLower = heading.toLowerCase();
  const contentLower = content.toLowerCase();
  
  return importantKeywords.some(keyword => 
    headingLower.includes(keyword) || 
    (contentLower.includes(keyword) && content.length > 100)
  );
}

function categorizeSection(heading: string): string {
  const lower = heading.toLowerCase();
  
  if (lower.includes('install') || lower.includes('setup') || lower.includes('getting started')) {
    return 'Installation';
  }
  if (lower.includes('api') || lower.includes('reference')) {
    return 'API Reference';
  }
  if (lower.includes('guide') || lower.includes('tutorial') || lower.includes('example')) {
    return 'Guide';
  }
  if (lower.includes('config') || lower.includes('setting')) {
    return 'Configuration';
  }
  
  return 'Documentation';
}

function detectLanguage(code: string): string {
  const lowerCode = code.toLowerCase();
  
  if (lowerCode.includes('npm install') || lowerCode.includes('yarn add') || lowerCode.includes('pnpm add')) {
    return 'bash';
  }
  if (lowerCode.includes('import ') || lowerCode.includes('export ') || lowerCode.includes('const ') || lowerCode.includes('function ')) {
    return 'javascript';
  }
  if (lowerCode.includes('interface ') || lowerCode.includes('type ') || lowerCode.includes(': string')) {
    return 'typescript';
  }
  if (lowerCode.includes('def ') || lowerCode.includes('import ') || lowerCode.includes('print(')) {
    return 'python';
  }
  if (lowerCode.includes('curl ') || lowerCode.includes('wget ') || lowerCode.includes('$ ')) {
    return 'bash';
  }
  if (lowerCode.includes('<?xml') || lowerCode.includes('<html') || lowerCode.includes('<div')) {
    return 'html';
  }
  if (lowerCode.includes('{') && lowerCode.includes('}') && lowerCode.includes(':')) {
    return 'json';
  }
  
  return 'text';
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCodeBlock(code: string): string {
  return code
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Legacy fallback for very simple pages
function extractIsolatedCodeBlocks(html: string, pageUrl: string, baseUrl: string): ExtractedSnippet[] {
  const codePatterns = [
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    /<code[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/code>/gi,
  ];
  
  const pageSnippets: ExtractedSnippet[] = [];
  const docName = new URL(baseUrl).hostname.replace("www.", "").split(".")[0];
  
  for (const pattern of codePatterns) {
    const matches = [...html.matchAll(pattern)];
    
    for (const match of matches) {
      const code = cleanCodeBlock(match[1]);
      
      if (code.length > 20 && code.length < 2000) {
        const beforeCode = html.substring(Math.max(0, match.index! - 1000), match.index!);
        const headingMatch = beforeCode.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
        const purpose = headingMatch ? headingMatch[1].replace(/<[^>]*>/g, '').trim() : 'Code example';
        
        pageSnippets.push({
          code,
          language: detectLanguage(code),
          purpose: purpose.substring(0, 200),
          sourceUrl: pageUrl,
          docName: docName.charAt(0).toUpperCase() + docName.slice(1),
          section: 'Documentation',
        });
      }
    }
  }
  
  return pageSnippets;
}