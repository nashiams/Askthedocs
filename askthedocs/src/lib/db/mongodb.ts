import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI || "";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDatabase(): Promise<Db> {
  // Return cached connection if exists
  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  if (!uri) {
    throw new Error("MONGO_URI is not defined");
  }

  try {
    // Create new connection if not cached
    if (!cachedClient) {
      cachedClient = new MongoClient(uri);
      await cachedClient.connect();
      console.log("Successfully connected to MongoDB!");
    }

    cachedDb = cachedClient.db("Askthedocs");
    return cachedDb;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// Optional: Close connection
export async function closeDatabase() {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
