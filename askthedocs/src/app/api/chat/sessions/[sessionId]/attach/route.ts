
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";
import { 
  indexDocument,
  isDocumentIndexedInQdrant 
} from "@/lib/services/doc-indexing.service";
import type { ChatSession } from "@/types/db";

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

    // Basic URL validation
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
        status: "ready",
        indexedDocs: session.indexedDocs,
      });
    }

    // First do a quick check in Qdrant to see if it's already indexed there
    // This is faster than checking MongoDB indexed_urls for already completed docs
    const isInQdrant = await isDocumentIndexedInQdrant(docUrl);
    
    if (isInQdrant) {
      // Document is already fully indexed in Qdrant, just attach to session
      const updatedSession = await sessions.findOneAndUpdate(
        { _id: new ObjectId(sessionId) },
        {
          $addToSet: { indexedDocs: docUrl },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );

      return NextResponse.json({
        message: "Documentation attached successfully",
        status: "ready",
        indexedDocs: updatedSession?.indexedDocs || [],
        fromCache: true,
      });
    }

    // Document not in Qdrant, use the shared service to handle indexing
    // The service will check MongoDB for indexing status and start indexing if needed
    const result = await indexDocument({
      url: docUrl,
      userEmail,
      sessionId, // Pass sessionId so it gets attached automatically
      validateUrl: true,  // Enable URL validation
      checkSafety: true,  // Enable safety check
    });

    // Handle error responses
    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Get the updated session to return current indexed docs
    const updatedSession = await sessions.findOne({
      _id: new ObjectId(sessionId)
    });

    // Return response based on indexing status
    return NextResponse.json({
      message: result.status === 'ready' 
        ? "Documentation attached successfully"
        : result.message,
      status: result.status,
      jobId: result.jobId,
      indexedDocs: updatedSession?.indexedDocs || [],
      channel: result.channel,
      fromCache: result.fromCache,
    });

  } catch (error) {
    console.error("Attach doc error:", error);
    return NextResponse.json(
      { error: "Failed to attach documentation" },
      { status: 500 }
    );
  }
}