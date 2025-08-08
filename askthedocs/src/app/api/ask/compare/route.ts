import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { learn, knownTechnology, concept } = await req.json();

    if (!learn || !knownTechnology) {
      return NextResponse.json(
        { error: 'Both "learn" and "knownTechnology" are required' },
        { status: 400 }
      );
    }

    // Search for snippets about the technology to learn
    const learnSnippets = await embeddingService.searchSnippets(
      `${learn} ${concept || ""}`,
      3,
      userEmail
    );

    if (learnSnippets.length === 0) {
      return NextResponse.json(
        {
          error: `No documentation found for ${learn}. Please index the documentation first.`,
        },
        { status: 404 }
      );
    }

    const context = learnSnippets
      .map((s) => `${s.purpose}:\n\`\`\`${s.language}\n${s.code}\n\`\`\``)
      .join("\n\n");

    // Generate comparison
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at explaining new technologies by comparing them to familiar ones.
          
          The user knows ${knownTechnology} and wants to learn ${learn}.
          
          Rules:
          1. Start with a direct comparison: "If ${knownTechnology} does X, then ${learn} does Y"
          2. Show code examples side by side when possible
          3. Point out key differences in approach or philosophy
          4. Highlight what's easier/harder in ${learn} compared to ${knownTechnology}
          5. Keep explanations short and practical
          6. Focus on the concept: ${concept || "general usage"}`,
        },
        {
          role: "user",
          content: `Explain ${learn} to me. I already know ${knownTechnology}.\n\nHere's how ${learn} works:\n${context}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const comparison = completion.choices[0].message.content || "";

    return NextResponse.json({
      comparison,
      learn,
      knownTechnology,
      snippetsUsed: learnSnippets.length,
      sources: [...new Set(learnSnippets.map((s) => s.sourceUrl))],
    });
  } catch (error) {
    console.error("Compare API error:", error);
    return NextResponse.json(
      { error: "Failed to generate comparison" },
      { status: 500 }
    );
  }
}
