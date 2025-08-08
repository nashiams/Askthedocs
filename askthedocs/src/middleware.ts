import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";

export async function middleware(request: NextRequest) {
  // Get session from NextAuth
  const session = await auth();

  // Check if user is authenticated
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized access: Please login" },
      { status: 401 }
    );
  }

  // Add user email to headers for API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-email", session.user.email);
  requestHeaders.set("x-user-id", session.user.id || "");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/api/ask/:path*",
    "/api/snippets/:path*",
    "/api/user/:path*",
    "/api/docs/crawl/:path*",
    "/api/admin/:path*",
    // Don't protect auth routes or public endpoints
  ],
};
