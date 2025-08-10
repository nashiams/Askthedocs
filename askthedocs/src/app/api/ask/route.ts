import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";
import { saveQuery } from "@/lib/db/collections";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// app/api/ask/route.ts - Simplified version without filtering
// app/api/ask/route.ts - Updated with dynamic comparisons
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query, docUrl, model = "gpt-4o-mini" } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Search for relevant snippets
    const snippets = await embeddingService.searchSnippets(query, 5);

    // Filter in memory if docUrl provided
    let filteredSnippets = snippets;
    if (docUrl) {
      filteredSnippets = snippets.filter(
        (s) => s.baseUrl === docUrl || s.sourceUrl?.startsWith(docUrl)
      );
    }

    if (filteredSnippets.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find relevant information in the indexed documentation.",
        sources: [],
        snippets: [],
        comparisons: [],
      });
    }

    // Build context
    const context = filteredSnippets
      .map((s, i) => {
        return `[Source: ${s.sourceUrl}]\n${s.purpose}\n\`\`\`${s.language}\n${s.code}\n\`\`\``;
      })
      .join("\n\n---\n\n");

    // Generate answer AND comparisons in one call
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a documentation assistant helping developers who struggle with reading docs.
          
          STRUCTURE YOUR ANSWER LIKE THIS:
          
          1. **One-line answer** - Direct solution
          2. **Big Picture** (2-3 lines) - Explain the concept/flow
          3. **WHERE THIS GOES** - Specify exact file location (e.g., "models/user.model.js" or "User model definition")
          4. **Code Example** with:
             - The CRITICAL part highlighted with comments like "// THIS IS THE KEY PART"
             - Show what happens when it works
             - Show what error you get when it fails
          5. **What You'll See** - Show actual console output or error messages
          
          IMPORTANT RULES:
          - Point out the EXACT error name (e.g., SequelizeValidationError)
          - Show WHERE to put code (which file/folder)
          - Include actual error output users will see
          - If uncertain about error names, prefix with "Likely:" or "Probably:"
          - Keep explanations to 1-2 lines max per concept
          - NO emojis in code comments (only in console.log statements if needed)`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nRelevant documentation:\n${context}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const answer = completion.choices[0].message.content || "";

    // Get comparison suggestions in a separate quick call
    const comparisonsResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Based on the technology being discussed, suggest 2-3 similar technologies that developers might know.
          Return ONLY a JSON array of strings. No explanation.
          Example: ["mongoose", "prisma", "typeorm"]`,
        },
        {
          role: "user",
          content: `The user is learning about: ${query}\nContext: ${answer.substring(0, 200)}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 100,
    });

    let comparisons = [];
    try {
      const comparisonsText =
        comparisonsResponse.choices[0].message.content || "[]";
      comparisons = JSON.parse(comparisonsText);
    } catch (e) {
      console.error("Failed to parse comparisons:", e);
      comparisons = [];
    }

    const tokensUsed =
      (completion.usage?.total_tokens || 0) +
      (comparisonsResponse.usage?.total_tokens || 0);

    // Save query to history
    await saveQuery({
      userEmail,
      query,
      answer,
      snippets: filteredSnippets.slice(0, 3).map((s) => ({
        code: s.code,
        url: s.sourceUrl,
        purpose: s.purpose,
      })),
      tokensUsed,
      model,
    }).catch(console.error);

    return NextResponse.json({
      answer,
      snippets: filteredSnippets.slice(0, 3),
      sources: [...new Set(filteredSnippets.map((s) => s.sourceUrl))],
      comparisons, // Dynamic suggestions from GPT
      tokensUsed,
      model,
    });
  } catch (error) {
    console.error("Ask API error:", error);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 }
    );
  }
}
