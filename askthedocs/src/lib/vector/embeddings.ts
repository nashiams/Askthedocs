import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";
import { qdrant } from "./qdrant";
// import { nanoid } from "nanoid";
import { ExtractedSnippet } from "@/types/snippet";
import { v4 as uuidv4 } from "uuid";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class EmbeddingService {
  private encoder;

  constructor() {
    this.encoder = encoding_for_model("text-embedding-3-small");
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
      const texts = batch.map(
        (snippet) => `${snippet.purpose}\n${snippet.language}\n${snippet.code}`
      );
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
              tokens: this.countTokens(batch[j].code),
              indexedAt: new Date().toISOString(),
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
        // Continue with next batch instead of failing completely
      }
    }
    return {
      stored: points.length,
      totalTokens: points.reduce((sum, p) => sum + p.payload.tokens, 0),
    };
  }

  // Search for relevant snippets
  async searchSnippets(query: string, limit: number = 5, docFilter?: string) {
    const queryEmbedding = await this.createEmbedding(query);

    const filter = docFilter
      ? { must: [{ key: "docName", match: { value: docFilter } }] }
      : undefined;

    const results = await qdrant.searchSnippets(queryEmbedding, limit, filter);

    return results;
  }
}

export const embeddingService = new EmbeddingService();
