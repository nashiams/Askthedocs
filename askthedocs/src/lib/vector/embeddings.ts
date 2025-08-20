// lib/vector/embeddings.ts - Updated searchSnippets method

import OpenAI from "openai";
import { encodingForModel } from "js-tiktoken";
import { qdrant } from "./qdrant";
import { ExtractedSnippet } from "@/types/snippet";
import { SnippetSearchResult } from "@/types/snippet";
import { v4 as uuidv4 } from "uuid";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class EmbeddingService {
  private encoder;

  constructor() {
    this.encoder = encodingForModel("text-embedding-3-small");
  }

  // Count tokens before embedding
  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  // Create embedding for a single text
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Failed to create embedding:", error);
      throw error;
    }
  }

  // Batch embed multiple texts
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    } catch (error) {
      console.error("Failed to create embeddings:", error);
      throw error;
    }
  }

  // Embed and store snippets
  async embedAndStoreSnippets(snippets: ExtractedSnippet[]) {
    const points = [];

    // Process in batches of 20
    const batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || "20");
    for (let i = 0; i < snippets.length; i += batchSize) {
      const batch = snippets.slice(i, i + batchSize);

      // Create text representation for embedding
      const texts = batch.map((snippet) => {
        const parts = [
          snippet.heading,
          snippet.parentHeading || '',
          snippet.type === 'code' ? `code example ${snippet.heading}` : snippet.heading.toLowerCase(),
        ];
        
        // Add clean content (first 300 chars)
        if (snippet.content) {
          const cleanContent = snippet.content
            .replace(/\[.*?\]\(.*?\)/g, '') // Remove markdown links
            .replace(/```[\s\S]*?```/g, snippet.codeSnippet || '') // Replace code blocks with actual code
            .substring(0, 300);
          parts.push(cleanContent);
        }
        
        return parts.filter(p => p).join(' ');
      });
      
      try {
        const embeddings = await this.createEmbeddings(texts);

        // Create points for Qdrant
        const batchPoints = [];
        for (let j = 0; j < batch.length; j++) {
          batchPoints.push({
            id: uuidv4(),
            vector: embeddings[j],
            payload: {
              ...batch[j],
              tokens: this.countTokens(batch[j].content || ''),
              indexedAt: new Date().toISOString(),
              code: batch[j].codeSnippet || '',
              purpose: batch[j].purpose || '',
              section: batch[j].section || '',
              language: batch[j].language || '',
            },
          });
        }

        // Store in Qdrant
        await qdrant.upsertSnippets(batchPoints);
        console.log(
          `Stored batch ${i / batchSize + 1}: ${batchPoints.length} snippets`
        );
        points.push(...batchPoints);
      } catch (error) {
        console.error(`Failed to process batch at index ${i}:`, error);
      }
    }
    return {
      stored: points.length,
      totalTokens: points.reduce((sum, p) => sum + p.payload.tokens, 0),
    };
  }

  // Updated search method - no filters, post-process instead
  async searchSnippets(query: string, limit: number = 5, docFilter?: string): Promise<SnippetSearchResult[]> {
    const queryEmbedding = await this.createEmbedding(query);

    // Always search without filters to avoid index errors
    // Get more results than needed so we can filter afterward
    const searchLimit = docFilter ? limit * 5 : limit;
    const results = await qdrant.searchSnippets(queryEmbedding, searchLimit);

    // Post-process filter if docFilter is provided
    if (docFilter) {
      const filtered = results.filter(r => {
        // Check multiple ways the doc might match
        return r.baseUrl === docFilter || 
               r.sourceUrl?.startsWith(docFilter) ||
               r.docName === docFilter ||
               (r.sourceUrl && docFilter.includes(new URL(r.sourceUrl).hostname));
      });
      
      return filtered.slice(0, limit);
    }

    return results.slice(0, limit);
  }

  private expandQuery(query: string): string[] {
    const variations = [query];
    const words = query.toLowerCase().split(/\s+/);
    
    // Common replacements for better semantic matching
    const synonymMap: Record<string, string[]> = {
      'install': ['setup', 'add', 'npm install', 'yarn add', 'installation', 'getting started'],
      'column': ['field', 'property', 'attribute', 'key'],
      'delete': ['remove', 'drop', 'destroy', 'erase'],
      'create': ['make', 'add', 'new', 'build', 'generate'],
      'update': ['modify', 'change', 'edit', 'alter', 'patch'],
      'get': ['fetch', 'retrieve', 'find', 'select', 'query'],
      'error': ['bug', 'issue', 'problem', 'exception', 'fail'],
      'config': ['configuration', 'settings', 'setup', 'options'],
      'how to': ['tutorial', 'guide', 'example', 'steps'],
      'use': ['usage', 'utilize', 'implement', 'apply'],
      'start': ['begin', 'initialize', 'setup', 'getting started'],
      'api': ['endpoint', 'REST', 'service', 'interface'],
      'auth': ['authentication', 'authorization', 'login', 'security'],
    };
    
    // Add synonym variations
    for (const word of words) {
      if (synonymMap[word]) {
        for (const synonym of synonymMap[word]) {
          variations.push(query.replace(word, synonym));
        }
      }
    }
    
    // Add variations with tool names if detected
    const toolNames = ['immer', 'firecrawl', 'react', 'vite'];
    for (const tool of toolNames) {
      if (!query.toLowerCase().includes(tool)) {
        variations.push(`${tool} ${query}`);
      }
    }
    
    return [...new Set(variations)].slice(0, 5); // Limit variations
  }

  async searchSnippetsWithFuzzy(query: string, limit: number = 5, docFilter?: string): Promise<SnippetSearchResult[]> {
    // Expand query variations
    const queries = this.expandQuery(query);
    
    // Get embeddings for all variations
    const embeddings = await this.createEmbeddings(queries);
    
    // Search with each embedding and combine results
    const allResults: SnippetSearchResult[] = [];
    
    for (const variation of queries) {
      const results = await this.searchSnippets(variation, limit * 2, docFilter);
      allResults.push(...results);
    }
    
    // Deduplicate and sort by best score
    const uniqueResults = new Map<string, SnippetSearchResult>();
    for (const result of allResults) {
      const key = `${result.sourceUrl}-${result.heading}`;
      if (!uniqueResults.has(key) || uniqueResults.get(key)!.score < result.score) {
        uniqueResults.set(key, result);
      }
    }
    
    return Array.from(uniqueResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // New method for multi-document search - simplified without filters
  async searchAcrossDocuments(
    query: string, 
    docUrls: string[], 
    snippetsPerDoc: number = 5
  ): Promise<Map<string, SnippetSearchResult[]>> {
    const resultsByDoc = new Map<string, SnippetSearchResult[]>();
    
    // Create a single embedding for the query
    const queryEmbedding = await this.createEmbedding(query);
    
    // Get all results at once without filters
    const totalLimit = Math.max(50, docUrls.length * snippetsPerDoc * 3);
    const allResults = await qdrant.searchSnippets(queryEmbedding, totalLimit);
    
    // Group results by document
    for (const docUrl of docUrls) {
      const docResults = allResults.filter(r => 
        r.baseUrl === docUrl || 
        r.sourceUrl?.startsWith(docUrl) ||
        (r.sourceUrl && docUrl.includes(new URL(r.sourceUrl).hostname))
      );
      
      // Take top results for this doc
      const filtered = docResults
        .filter(r => r.score > 0.4)
        .slice(0, snippetsPerDoc);
      
      resultsByDoc.set(docUrl, filtered);
    }
    
    return resultsByDoc;
  }
}

export const embeddingService = new EmbeddingService();