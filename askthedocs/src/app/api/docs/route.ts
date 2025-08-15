// api/docs/route.ts

import { NextRequest, NextResponse } from "next/server";
import { 
  indexDocument, 
  getUserIndexedDocs 
} from "@/lib/services/doc-indexing.service";

// POST: Submit URL for crawling
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url, sessionId } = await req.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Use the shared service to index the document
    const result = await indexDocument({
      url,
      userEmail,
      sessionId,
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

    // Return successful response
    return NextResponse.json({
      jobId: result.jobId,
      status: result.status,
      message: result.message,
      channel: result.channel,
      baseUrl: result.baseUrl || url,
      fromCache: result.fromCache,
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

    // Use the shared service to get user's indexed docs
    const result = await getUserIndexedDocs(userEmail);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error("List docs error:", error);
    return NextResponse.json(
      { error: "Failed to list indexed docs" },
      { status: 500 }
    );
  }
}