// app/api/setup/qdrant/route.ts
import { NextResponse } from "next/server";
import { qdrant } from "@/lib/vector/qdrant";

export async function GET() {
  try {
    await qdrant.initialize();
    return NextResponse.json({
      message: "Qdrant collection created successfully",
      collection: "code_snippets",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to initialize Qdrant",
        details: error,
      },
      { status: 500 }
    );
  }
}
