// lib/services/doc-indexing.service.ts

import { inngest } from "@/inngest/client";
import { qdrant } from "@/lib/vector/qdrant";
import { saveIndexedDoc } from "@/lib/db/collections";
import { nanoid } from "nanoid";
import Ably from "ably";
import { z } from "zod";
import { redis } from "@/lib/cache/redis";
import { getDatabase } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

// Zod schema for URL validation
export const docUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const urlObj = new URL(url);
        // Ensure HTTPS protocol
        if (urlObj.protocol !== "https:") {
          return false;
        }
        // Block localhost and internal IPs
        const hostname = urlObj.hostname.toLowerCase();
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          hostname.startsWith("172.")
        ) {
          return false;
        }
        // Block common non-doc domains
        const blockedDomains = [
          "facebook.com",
          "twitter.com",
          "instagram.com",
          "youtube.com",
          "tiktok.com",
          "amazon.com",
          "google.com",
          "gmail.com",
          "reddit.com",
        ];
        if (blockedDomains.some((domain) => hostname.includes(domain))) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid documentation URL or blocked domain" }
  );

// Google Safe Browsing check (with caching)
export async function checkUrlSafety(
  url: string
): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Check Redis cache first
    const cacheKey = `safety:${url}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    // Call Google Safe Browsing API
    const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) {
      console.warn("Google Safe Browsing API key not configured");
      return { safe: true }; // Allow if not configured (for dev)
    }

    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: {
            clientId: "askthedocs",
            clientVersion: "1.0.0",
          },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      }
    );

    const data = await response.json();
    const safe = !data.matches || data.matches.length === 0;
    const result = {
      safe,
      reason: safe ? undefined : "URL flagged by Google Safe Browsing",
    };

    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify(result), { ex: 86400 });

    return result;
  } catch (error) {
    console.error("Google Safe Browsing check failed:", error);
    // Allow on error (don't block users due to API issues)
    return { safe: true };
  }
}

interface IndexDocumentOptions {
  url: string;
  userEmail: string;
  sessionId?: string;
  validateUrl?: boolean; // Default true
  checkSafety?: boolean; // Default true
}

interface IndexDocumentResult {
  status: 'ready' | 'indexing' | 'queued' | 'error';
  jobId?: string;
  message: string;
  baseUrl?: string;
  fromCache?: boolean;
  channel?: string;
  error?: string;
}

/**
 * Core function to handle document indexing
 * Checks if document is already indexed, being indexed, or needs new indexing
 */
export async function indexDocument({
  url,
  userEmail,
  sessionId,
  validateUrl = true,
  checkSafety = true,
}: IndexDocumentOptions): Promise<IndexDocumentResult> {
  try {
    // Step 1: URL validation (if enabled)
    if (validateUrl) {
      const validation = docUrlSchema.safeParse(url);
      if (!validation.success) {
        return {
          status: 'error',
          error: validation.error.errors[0].message,
          message: validation.error.errors[0].message,
        };
      }
    }

    // Step 2: Safety check (if enabled)
    if (checkSafety) {
      const safety = await checkUrlSafety(url);
      if (!safety.safe) {
        return {
          status: 'error',
          error: safety.reason || "URL failed safety check",
          message: safety.reason || "URL failed safety check",
        };
      }
    }

    const db = await getDatabase();
    const indexedUrls = db.collection("indexed_urls");
    
    // Check if already completely indexed
    const existingDoc = await indexedUrls.findOne({ 
      url, 
      status: 'complete' 
    });
    
    if (existingDoc) {
      console.log("URL already indexed, using cached version");
      
      // If sessionId provided, attach to session
      if (sessionId) {
        const sessions = db.collection("sessions");
        await sessions.updateOne(
          { _id: new ObjectId(sessionId) },
          { 
            $addToSet: { indexedDocs: url },
            $set: { updatedAt: new Date() }
          }
        );
      }
      
      return {
        status: 'ready',
        message: "Documentation already indexed",
        baseUrl: url,
        fromCache: true,
      };
    }

    // Check if currently being indexed
    const indexingDoc = await indexedUrls.findOne({ 
      url, 
      status: 'indexing' 
    });
    
    if (indexingDoc) {
      // If sessionId provided, still attach to session (will be ready later)
      if (sessionId) {
        const sessions = db.collection("sessions");
        await sessions.updateOne(
          { _id: new ObjectId(sessionId) },
          { 
            $addToSet: { indexedDocs: url },
            $set: { updatedAt: new Date() }
          }
        );
      }
      
      return {
        status: 'indexing',
        message: "Documentation is currently being indexed by another user",
        jobId: indexingDoc.jobId,
        channel: `crawl-${userEmail}`,
      };
    }

    // Need to start new indexing
    const jobId = `job_${nanoid()}`;
    const channel = ably.channels.get(`crawl-${userEmail}`);

    // Mark as indexing in MongoDB
    await indexedUrls.insertOne({
      url,
      docName: new URL(url).hostname,
      indexedAt: new Date(),
      indexedBy: userEmail,
      snippetsCount: 0,
      status: 'indexing',
      jobId
    });

    // Trigger Inngest background job
    await inngest.send({
      name: "docs/crawl.requested",
      data: {
        url,
        userEmail,
        jobId,
        sessionId // Will be used to auto-attach when complete
      },
    });

    // Save to database
    await saveIndexedDoc({
      url,
      userEmail,
      jobId,
      status: "queued",
    });

    // Notify via Ably
    await channel.publish("progress", {
      jobId,
      status: "queued",
      message: "Documentation crawl started",
      url,
      sessionId,
    });

    // If sessionId provided, attach to session (will be ready later)
    if (sessionId) {
      const sessions = db.collection("sessions");
      await sessions.updateOne(
        { _id: new ObjectId(sessionId) },
        { 
          $addToSet: { indexedDocs: url },
          $set: { updatedAt: new Date() }
        }
      );
    }

    return {
      status: 'queued',
      jobId,
      message: "Indexing started. This will take 3-5 minutes.",
      channel: `crawl-${userEmail}`,
    };

  } catch (error) {
    console.error("Document indexing error:", error);
    return {
      status: 'error',
      error: "Failed to start indexing",
      message: "Failed to start indexing",
    };
  }
}

/**
 * Check if a document is already indexed in Qdrant
 * Used by attach route for quick checks
 */
export async function isDocumentIndexedInQdrant(url: string): Promise<boolean> {
  try {
    const existing = await qdrant.scroll({
      collection_name: "code_snippets",
      scroll_filter: {
        must: [{ key: "baseUrl", match: { value: url } }],
      },
      limit: 1,
    });

    return !!(existing.points && existing.points.length > 0);
  } catch (error) {
    console.error("Error checking Qdrant for document:", error);
    return false;
  }
}

/**
 * Get list of indexed documents for a user
 */
export async function getUserIndexedDocs(userEmail: string) {
  try {
    const result = await qdrant.scroll({
      collection_name: "code_snippets",
      scroll_filter: {
        must: [{ key: "indexedBy", match: { value: userEmail } }],
      },
      limit: 100,
      with_payload: ["baseUrl", "docName", "indexedAt"],
    });

    // Group by baseUrl to get unique docs
    const uniqueDocs = new Map();
    result.points?.forEach(
      (point: {
        id: string | number;
        payload?: Record<string, unknown> | null;
      }) => {
        const payload = point.payload as
          | { baseUrl?: string; docName?: string; indexedAt?: string }
          | undefined;
        const baseUrl = payload?.baseUrl;
        if (baseUrl && !uniqueDocs.has(baseUrl)) {
          uniqueDocs.set(baseUrl, {
            url: baseUrl,
            name: payload?.docName || "Unknown",
            indexedAt: payload?.indexedAt,
          });
        }
      }
    );

    return {
      docs: Array.from(uniqueDocs.values()),
      total: uniqueDocs.size,
    };
  } catch (error) {
    console.error("Error getting user indexed docs:", error);
    throw error;
  }
}