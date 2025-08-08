// lib/vector/qdrant.ts (revised with proper types)
import { SnippetPayload, SnippetSearchResult } from "@/types/snippet";
import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = "code_snippets";
const VECTOR_SIZE = 1536; // OpenAI embedding size

class QdrantService {
  private client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  async scroll(params: {
    collection_name: string;
    scroll_filter?: any;
    limit?: number;
    with_payload?: boolean | string[];
  }) {
    try {
      const result = await this.client.scroll(params.collection_name, {
        filter: params.scroll_filter,
        limit: params.limit || 10,
        with_payload: params.with_payload ?? true,
      });
      return result;
    } catch (error) {
      console.error("Scroll error:", error);
      return { points: [] };
    }
  }

  async initialize() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === COLLECTION_NAME
      );

      if (!exists) {
        // Create collection with proper configuration
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: VECTOR_SIZE,
            distance: "Cosine",
          },
        });
        console.log(`Created collection: ${COLLECTION_NAME}`);
      }
    } catch (error) {
      console.error("Failed to initialize Qdrant:", error);
      throw error;
    }
  }

  async upsertSnippets(
    points: Array<{
      id: string;
      vector: number[];
      payload: SnippetPayload;
    }>
  ) {
    try {
      const result = await this.client.upsert(COLLECTION_NAME, {
        wait: true,
        points: points.map((p) => ({
          ...p,
          payload: { ...p.payload },
        })),
      });
      return result;
    } catch (error) {
      console.error("Failed to upsert snippets:", error);
      throw error;
    }
  }

  async searchSnippets(
    queryVector: number[],
    limit: number = 5,
    filter?: any
  ): Promise<SnippetSearchResult[]> {
    try {
      const results = await this.client.search(COLLECTION_NAME, {
        vector: queryVector,
        limit,
        filter,
        with_payload: true,
      });

      return results.map((result) => ({
        score: result.score,
        ...(result.payload as unknown as SnippetPayload),
      }));
    } catch (error) {
      console.error("Search failed:", error);
      throw error;
    }
  }

  async deleteCollection() {
    try {
      await this.client.deleteCollection(COLLECTION_NAME);
      console.log(`Deleted collection: ${COLLECTION_NAME}`);
    } catch (error) {
      console.error("Failed to delete collection:", error);
    }
  }

  async getCollectionInfo() {
    try {
      const info = await this.client.getCollection(COLLECTION_NAME);
      return info;
    } catch (error) {
      console.error("Failed to get collection info:", error);
      return null;
    }
  }
}

export const qdrant = new QdrantService();
