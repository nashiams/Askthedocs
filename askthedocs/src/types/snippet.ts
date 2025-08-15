export interface ExtractedSnippet {
  // Core content
  content: string;        // Full text (header + body + code)
  type: 'section' | 'code' | 'mixed';
  heading: string;        // "Installing Cheerio"
  parentHeading?: string; // "Getting Started"
  level: number;          // h1=1, h2=2, h3=3
  codeSnippet?: string;   // Just the code if exists
  sourceUrl: string;
  baseUrl: string;
  position: number;       // Order in document
  language?: string;
  docName: string;
  purpose?: string
  section?: string
  code?: string
}

// Define the snippet payload type
export interface SnippetPayload {
  code: string;
  language: string;
  purpose: string;
  sourceUrl: string;
  docName: string;
  section: string;
  warning?: string;
  tokens: number;
  indexedAt: string;
}

// Define the search result type
export interface SnippetSearchResult extends ExtractedSnippet {
  score: number;
  tokens: number;
  indexedAt: string;
  indexedBy?: string;
  // Legacy fields for backward compatibility
  code?: string;
  purpose?: string;
  section?: string;
  language?: string;
}
