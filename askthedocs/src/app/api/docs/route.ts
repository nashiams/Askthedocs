import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { qdrant } from "@/lib/vector/qdrant";
import { saveIndexedDoc } from "@/lib/db/collections";
import { nanoid } from "nanoid";
import Ably from "ably";
import { z } from "zod";
import { redis } from "@/lib/cache/redis";
import { getDatabase } from "@/lib/db/mongodb"; // Added import
import { ObjectId } from "mongodb"; // Added import

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

// Zod schema for URL validation
const docUrlSchema = z
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
async function checkUrlSafety(
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

// POST: Submit URL for crawling
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channel = ably.channels.get(`crawl-${userEmail}`);
    const { url, sessionId } = await req.json(); // Modified line 119: Accept sessionId

    // Step 1: Zod validation (instant)
    const validation = docUrlSchema.safeParse(url);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // Check MongoDB first for faster deduplication - REPLACED SECTION (lines 129-140)
    const db = await getDatabase();
    const indexedUrls = db.collection("indexed_urls");
    
    const existingDoc = await indexedUrls.findOne({ 
      url, 
      status: 'complete' 
    });
    
    if (existingDoc) {
      console.log("URL already indexed by another user, skipping crawl");
      
      // If sessionId provided, attach to session immediately
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
      
      return NextResponse.json({
        message: "Documentation already indexed",
        status: "ready",
        baseUrl: url,
        fromCache: true // Added fromCache flag
      });
    }

    // Check if currently being indexed - NEW SECTION (lines 155-164)
    const indexingDoc = await indexedUrls.findOne({ 
      url, 
      status: 'indexing' 
    });
    
    if (indexingDoc) {
      return NextResponse.json({
        message: "Documentation is currently being indexed by another user",
        status: "indexing",
        jobId: indexingDoc.jobId
      });
    }

    // Step 2: Google Safe Browsing check (async but fast with cache)
    const safety = await checkUrlSafety(url);
    if (!safety.safe) {
      return NextResponse.json(
        { error: safety.reason || "URL failed safety check" },
        { status: 400 }
      );
    }

    // Generate job ID
    const jobId = `job_${nanoid()}`;

    // Mark as indexing in MongoDB - NEW SECTION (lines 180-189)
    await indexedUrls.insertOne({
      url,
      docName: new URL(url).hostname,
      indexedAt: new Date(),
      indexedBy: userEmail,
      snippetsCount: 0,
      status: 'indexing',
      jobId
    });

    // Trigger Inngest background job - Modified line 192: Pass sessionId
    await inngest.send({
      name: "docs/crawl.requested",
      data: {
        url,
        userEmail,
        jobId,
        sessionId // Pass sessionId to crawl function
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
    });

    return NextResponse.json({
      jobId,
      status: "queued",
      message: "Indexing started. This will take 3-5 minutes.",
      channel: `crawl-${userEmail}`,
    });
  } catch (error) {
    console.error("Docs API error:", error);
    return NextResponse.json(
      { error: "Failed to start indexing" },
      { status: 500 }
    );
  }
}

// GET: List indexed documentations (unchanged)
export async function GET(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get unique base URLs from Qdrant
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

    return NextResponse.json({
      docs: Array.from(uniqueDocs.values()),
      total: uniqueDocs.size,
    });
  } catch (error) {
    console.error("List docs error:", error);
    return NextResponse.json(
      { error: "Failed to list indexed docs" },
      { status: 500 }
    );
  }
}