export interface ExtractedSnippet {
  code: string;
  language: string;
  purpose: string;
  sourceUrl: string;
  docName: string;
  section: string;
  warning?: string;
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
export interface SnippetSearchResult extends SnippetPayload {
  baseUrl: any;
  score: number;
}
