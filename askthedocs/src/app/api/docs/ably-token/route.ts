// Give frontend a token to connect to Ably
import Ably from "ably";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const userEmailHeader = req.headers.get("x-user-email");
  const userEmail = userEmailHeader === null ? undefined : userEmailHeader;

  const ably = new Ably.Rest(process.env.ABLY_API_KEY!);
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: userEmail,
    capability: {
      [`crawl-${userEmail}`]: ["subscribe"],
    },
  });

  return NextResponse.json(tokenRequest);
}
