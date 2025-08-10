import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";
import { inngest } from "@/inngest/client";
import { qdrant } from "@/lib/vector/qdrant";
import { saveIndexedDoc } from "@/lib/db/collections";
import { nanoid } from "nanoid";
import Ably from "ably";
import type { ChatSession } from "@/types/db";

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = params;
    const { docUrl } = await req.json();

    if (!docUrl || !docUrl.startsWith("http")) {
      return NextResponse.json(
        { error: "Valid documentation URL required" },
        { status: 400 }
      );
    }

    // Validate sessionId
    if (!ObjectId.isValid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");

    // Verify session exists and belongs to user
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      userId: userEmail,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if doc already attached to this session
    if (session.indexedDocs?.includes(docUrl)) {
      return NextResponse.json({
        message: "Documentation already attached to this chat",
        indexedDocs: session.indexedDocs,
      });
    }

    // Check if doc is already indexed in Qdrant
    const existing = await qdrant.scroll({
      collection_name: "code_snippets",
      scroll_filter: {
        must: [{ key: "baseUrl", match: { value: docUrl } }],
      },
      limit: 1,
    });

    let jobId = null;
    let status = "ready";

    // If not indexed, trigger crawling
    if (!existing.points || existing.points.length === 0) {
      jobId = `job_${nanoid()}`;
      status = "indexing";

      // Trigger Inngest crawl job
      await inngest.send({
        name: "docs/crawl.requested",
        data: {
          url: docUrl,
          userEmail,
          jobId,
          sessionId, // Include sessionId for auto-attach after crawl
        },
      });

      // Save indexing job to database
      await saveIndexedDoc({
        url: docUrl,
        userEmail,
        jobId,
        status: "queued",
      });

      // Notify via Ably
      const channel = ably.channels.get(`crawl-${userEmail}`);
      await channel.publish("progress", {
        jobId,
        status: "queued",
        message: `Indexing ${docUrl} for your chat...`,
        url: docUrl,
        sessionId,
      });
    }

    // Update session with new doc
    const updatedSession = await sessions.findOneAndUpdate(
      { _id: new ObjectId(sessionId) },
      {
        $addToSet: { indexedDocs: docUrl },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" }
    );

    return NextResponse.json({
      message:
        status === "ready"
          ? "Documentation attached successfully"
          : "Documentation is being indexed and will be attached when ready",
      status,
      jobId,
      indexedDocs: updatedSession?.indexedDocs || [],
      channel: status === "indexing" ? `crawl-${userEmail}` : undefined,
    });
  } catch (error) {
    console.error("Attach doc error:", error);
    return NextResponse.json(
      { error: "Failed to attach documentation" },
      { status: 500 }
    );
  }
}
