import { ObjectId } from "mongodb";
import { getDatabase } from "./mongodb";
import { Query, User } from "@/types/db";

// User operations
export async function createOrUpdateUser(userData: {
  email: string;
  name: string;
  provider: "google" | "github";
  providerId: string;
}) {
  const db = await getDatabase();
  const users = db.collection<User>("users");

  const result = await users.findOneAndUpdate(
    { email: userData.email },
    {
      $set: {
        ...userData,
        lastLogin: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
        queryCount: 0,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return result;
}

export async function findUserByEmail(email: string) {
  const db = await getDatabase();
  const users = db.collection<User>("users");
  return users.findOne({ email });
}

export async function incrementQueryCount(email: string) {
  const db = await getDatabase();
  const users = db.collection<User>("users");
  return users.updateOne({ email }, { $inc: { queryCount: 1 } });
}

// Query operations
export async function saveQuery(queryData: {
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
}) {
  const db = await getDatabase();
  const queries = db.collection<Query>("queries");

  const result = await queries.insertOne({
    ...queryData,
    timestamp: new Date(),
  });

  // Increment user's query count
  await incrementQueryCount(queryData.userEmail);

  return result;
}

export async function getUserQueries(email: string, limit: number = 20) {
  const db = await getDatabase();
  const queries = db.collection<Query>("queries");

  return queries
    .find({ userEmail: email })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

export async function updateQueryFeedback(queryId: string, helpful: boolean) {
  const db = await getDatabase();
  const queries = db.collection<Query>("queries");

  return queries.updateOne(
    { _id: new ObjectId(queryId) },
    { $set: { helpful } }
  );
}

// Stats operations
export async function getUserStats(email: string) {
  const user = await findUserByEmail(email);
  const db = await getDatabase();
  const queries = db.collection<Query>("queries");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayQueries = await queries.countDocuments({
    userEmail: email,
    timestamp: { $gte: today },
  });

  const totalTokens = await queries
    .aggregate([
      { $match: { userEmail: email } },
      { $group: { _id: null, total: { $sum: "$tokensUsed" } } },
    ])
    .toArray();

  return {
    totalQueries: user?.queryCount || 0,
    todayQueries,
    totalTokensUsed: totalTokens[0]?.total || 0,
  };
}

// Indexed docs operations
export async function saveIndexedDoc(data: {
  url: string;
  userEmail: string;
  jobId: string;
  status: string;
}) {
  const db = await getDatabase();
  const indexed_docs = db.collection("indexed_docs");

  return indexed_docs.insertOne({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function updateIndexedDocStatus(
  jobId: string,
  status: string,
  metadata?: any
) {
  const db = await getDatabase();
  const indexed_docs = db.collection("indexed_docs");

  return indexed_docs.updateOne(
    { jobId },
    {
      $set: {
        status,
        ...metadata,
        updatedAt: new Date(),
      },
    }
  );
}

export async function getIndexedDocStatus(jobId: string) {
  const db = await getDatabase();
  const indexed_docs = db.collection("indexed_docs");

  return indexed_docs.findOne({ jobId });
}
