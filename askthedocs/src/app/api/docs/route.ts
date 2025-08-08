import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { qdrant } from "@/lib/vector/qdrant";
import { redis } from "@/lib/cache/redis";
import { saveIndexedDoc } from "@/lib/db/collections";
import { nanoid } from "nanoid";

// POST: Submit URL for crawling
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();

    if (!url || !url.startsWith("http")) {
      return NextResponse.json(
        { error: "Valid URL required" },
        { status: 400 }
      );
    }

    // Check if already indexed
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

    // Notify via Redis PubSub
    await redis.rpush(
      `crawl-${userEmail}`,
      JSON.stringify({
        jobId,
        status: "queued",
        url,
        message: "Documentation crawl started",
      })
    );

    return NextResponse.json({
      jobId,
      status: "queued",
      message: "Indexing started. This will take 3-5 minutes.",
      subscribeChannel: `crawl-${userEmail}`,
    });
  } catch (error) {
    console.error("Docs API error:", error);
    return NextResponse.json(
      { error: "Failed to start indexing" },
      { status: 500 }
    );
  }
}

// GET: List indexed documentations
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
        // other possible fields omitted for brevity
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
