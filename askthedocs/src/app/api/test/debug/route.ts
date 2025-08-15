// app/api/debug/check-docs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { qdrant } from '../../../../lib/vector/qdrant';

export async function GET(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the doc URLs from query params
    const searchParams = req.nextUrl.searchParams;
    const docUrls = searchParams.get("docs")?.split(",") || [];
    
    if (docUrls.length === 0) {
      return NextResponse.json({ error: "No docs specified" }, { status: 400 });
    }

    const diagnostics: any = {};

    for (const docUrl of docUrls) {
      const docDomain = new URL(docUrl).hostname;
      
      // Try to find any points for this doc
      const scrollResult = await qdrant.scroll({
        collection_name: "code_snippets",
        limit: 100,
        with_payload: true,
      });

      // Filter points that might belong to this doc
      const matchingPoints = scrollResult.points?.filter((point: any) => {
        const payload = point.payload;
        return (
          payload.baseUrl === docUrl ||
          payload.baseUrl?.includes(docDomain) ||
          payload.sourceUrl?.startsWith(docUrl) ||
          payload.sourceUrl?.includes(docDomain) ||
          payload.docName === docUrl ||
          payload.docName?.includes(docDomain)
        );
      }) || [];

      // Get unique values for debugging
      const uniqueBaseUrls = new Set(
        matchingPoints.map((p: any) => p.payload.baseUrl).filter(Boolean)
      );
      const uniqueDocNames = new Set(
        matchingPoints.map((p: any) => p.payload.docName).filter(Boolean)
      );
      const sampleSourceUrls = matchingPoints
        .slice(0, 5)
        .map((p: any) => p.payload.sourceUrl)
        .filter(Boolean);

      diagnostics[docUrl] = {
        domain: docDomain,
        pointsFound: matchingPoints.length,
        uniqueBaseUrls: Array.from(uniqueBaseUrls),
        uniqueDocNames: Array.from(uniqueDocNames),
        sampleSourceUrls,
        samplePayload: matchingPoints[0]?.payload || null,
      };
    }

    // Also get some random points to see what's in the collection
    const randomScroll = await qdrant.scroll({
      collection_name: "code_snippets",
      limit: 10,
      with_payload: ["baseUrl", "sourceUrl", "docName"],
    });

    const randomSample = randomScroll.points?.map((p: any) => ({
      baseUrl: p.payload.baseUrl,
      sourceUrl: p.payload.sourceUrl?.substring(0, 50),
      docName: p.payload.docName,
    }));

    return NextResponse.json({
      diagnostics,
      randomSample,
      message: "Check the diagnostics to see how documents are stored in Qdrant",
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    return NextResponse.json(
      { error: "Failed to run diagnostics" },
      { status: 500 }
    );
  }
}

// Example usage:
// GET /api/debug/check-docs?docs=https://immerjs.github.io/immer/,https://docs.firecrawl.dev/