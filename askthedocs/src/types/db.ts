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
