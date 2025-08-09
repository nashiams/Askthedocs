// app/api/test/crawl-status/route.ts (for testing only)
import Ably from "ably";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const userEmail = req.headers.get("x-user-email");

  // Connect to Ably
  const ably = new Ably.Rest(process.env.ABLY_API_KEY!);
  const channel = ably.channels.get(`crawl-${userEmail}`);

  // Get recent message history
  const history = await channel.history({ limit: 10 });

  return NextResponse.json({
    messages: history.items.map((item) => item.data),
    channel: `crawl-${userEmail}`,
  });
}
