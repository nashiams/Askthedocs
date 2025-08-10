import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { ChatSession } from "@/types/db";

export async function GET(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");
    const messages = db.collection("messages");

    // Get all sessions for user
    const userSessions = await sessions
      .find({ userId: userEmail })
      .sort({ updatedAt: -1 })
      .toArray();

    // Get message count and generate title for each session
    const sessionsWithDetails = await Promise.all(
      userSessions.map(async (session) => {
        // Get message count
        const messageCount = await messages.countDocuments({
          sessionId: session._id,
        });

        // Get first user message for title if no title exists
        let title = session.title;
        if (!title || title === "New Chat") {
          const firstMessage = await messages.findOne(
            { sessionId: session._id, role: "user" },
            { sort: { timestamp: 1 } }
          );

          if (firstMessage?.content) {
            // Use first 50 chars of first question as title
            title = firstMessage.content.substring(0, 50);
            if (firstMessage.content.length > 50) title += "...";

            // Update session with generated title
            await sessions.updateOne({ _id: session._id }, { $set: { title } });
          }
        }

        return {
          id: session._id.toString(),
          title: title || "New Chat",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          indexedDocs: session.indexedDocs || [],
          messageCount,
          isPinned: session.isPinned || false,
        };
      })
    );

    return NextResponse.json({
      sessions: sessionsWithDetails,
      total: sessionsWithDetails.length,
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat sessions" },
      { status: 500 }
    );
  }
}

// POST: Create new chat session
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { indexedDocs = [] } = await req.json();

    const db = await getDatabase();
    const sessions = db.collection<ChatSession>("sessions");

    const newSession: ChatSession = {
      _id: new ObjectId(),
      userId: userEmail,
      title: "New Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      indexedDocs: indexedDocs,
      isPinned: false,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    const result = await sessions.insertOne(newSession);

    return NextResponse.json({
      sessionId: result.insertedId.toString(),
      title: newSession.title,
      indexedDocs: newSession.indexedDocs,
      createdAt: newSession.createdAt,
    });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    );
  }
}
