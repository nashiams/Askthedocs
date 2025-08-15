import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { ChatSession, Message, IndexedDoc } from "@/types/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = params;

    // Validate sessionId format
    if (!ObjectId.isValid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");
    const messages = db.collection<Message>("messages");
    const indexedDocs = db.collection<IndexedDoc>("indexed_docs");

    // Get session details
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      userId: userEmail, // Ensure user owns this session
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get all messages for this session
    const sessionMessages = await messages
      .find({ sessionId: new ObjectId(sessionId) })
      .sort({ timestamp: 1 }) // Oldest first
      .toArray();

    // Get details of indexed docs if any
    let docsDetails: {
      url: string;
      name: string;
      snippetsCount: number;
      indexedAt: Date;
    }[] = [];
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      const docs = await indexedDocs
        .find({ url: { $in: session.indexedDocs } })
        .toArray();

      docsDetails = docs.map((doc) => ({
        url: doc.url,
        name: doc.name,
        snippetsCount: doc.snippetsCount,
        indexedAt: doc.indexedAt,
      }));
    }

    // Format response
    const response = {
      session: {
        id: session._id.toString(),
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isPinned: session.isPinned || false,
        indexedDocs: docsDetails,
      },
      messages: sessionMessages.map((msg) => ({
        id: msg._id.toString(),
        role: msg.role,
        content: msg.content,
        query: msg.query,
        sources: msg.sources,
        tokensUsed: msg.tokensUsed,
        timestamp: msg.timestamp,
      })),
      messageCount: sessionMessages.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get session history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 }
    );
  }
}
