import { ObjectId } from "mongodb";

// Types
export interface User {
  _id?: ObjectId;
  email: string;
  name: string;
  provider: "google" | "github";
  providerId: string;
  createdAt: Date;
  lastLogin: Date;
  queryCount: number;
}

export interface Query {
  _id?: ObjectId;
  userEmail: string;
  query: string;
  answer: string;
  snippets: Array<{
    code: string;
    url: string;
    purpose: string;
  }>;
  tokensUsed: number;
  model: string;
  timestamp: Date;
  helpful?: boolean;
}

// types/database.ts
export interface ChatSession {
  _id: ObjectId;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  indexedDocs: string[];
  isPinned?: boolean;
  expiresAt?: Date;
}

export interface Message {
  _id: ObjectId;
  sessionId: ObjectId;
  role: "user" | "assistant";
  content: string;
  query?: string;
  sources?: string[];
  tokensUsed?: number;
  suggestedQuery?: string; // Add this field
  timestamp: Date;
  searchedDocs?: string[];
  docCoverage?: { [k: string]: number }
}

export interface IndexedDoc {
  _id: ObjectId;
  url: string;
  name: string;
  userId: string;
  snippetsCount: number;
  indexedAt: Date;
}

export interface IndexedUrl {
  _id: ObjectId;
  url: string;
  docName: string;
  indexedAt: Date;
  indexedBy: string; // First user who indexed it
  snippetsCount: number;
  status: 'complete' | 'indexing' | 'failed';
  jobId?: string;
}

