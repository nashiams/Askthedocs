import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { embeddingService } from "@/lib/vector/embeddings";
import { saveQuery } from "@/lib/db/collections";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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

    // Search for relevant snippets from indexed docs
    const docFilter = docUrl ? docUrl : userEmail;

    const snippets = await embeddingService.searchSnippets(query, 5, docFilter);

    if (snippets.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find relevant information in the indexed documentation. Make sure the docs are indexed first by submitting the URL.",
        sources: [],
        snippets: [],
      });
    }

    // Build context from snippets
    const context = snippets
      .map((s, i) => {
        return `[Source: ${s.sourceUrl}]\n${s.purpose}\n\`\`\`${s.language}\n${s.code}\n\`\`\``;
      })
      .join("\n\n---\n\n");

    // Generate answer
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a documentation assistant that explains complex documentation in simple terms.
          
          Rules:
          1. Start with the code example that solves the user's problem
          2. Explain what each part does in simple terms (1-2 lines max per concept)
          3. Point out any potential costs, performance issues, or gotchas
          4. Keep explanations concise - developers want quick answers
          5. Use analogies if it helps understanding
          6. If the code might cause issues (like high costs or performance problems), warn clearly`,
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
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Save query to history
    await saveQuery({
      userEmail,
      query,
      answer,
      snippets: snippets.slice(0, 3).map((s) => ({
        code: s.code,
        url: s.sourceUrl,
        purpose: s.purpose,
      })),
      tokensUsed,
      model,
    }).catch(console.error);

    return NextResponse.json({
      answer,
      snippets: snippets.slice(0, 3),
      sources: [...new Set(snippets.map((s) => s.sourceUrl))],
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
