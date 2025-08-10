import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { qdrant } from "@/lib/vector/qdrant";
import { saveIndexedDoc } from "@/lib/db/collections";
import { nanoid } from "nanoid";
import Ably from "ably";
import { z } from "zod";
import { redis } from "@/lib/cache/redis";

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
    const { url } = await req.json();

    // Step 1: Zod validation (instant)
    const validation = docUrlSchema.safeParse(url);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // Check if already indexed (do this before Google check to save API calls)
    const existing = await qdrant.scroll({
      collection_name: "code_snippets",
      scroll_filter: {
        must: [{ key: "baseUrl", match: { value: url } }],
      },
      limit: 1,
    });

    if (existing.points && existing.points.length > 0) {
      return NextResponse.json({
        message: "Documentation already indexed",
        status: "ready",
        baseUrl: url,
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

    // Trigger Inngest background job
    await inngest.send({
      name: "docs/crawl.requested",
      data: {
        url,
        userEmail,
        jobId,
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
