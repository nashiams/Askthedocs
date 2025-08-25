// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  // NextAuth v5 uses different cookie names
  
  // Try multiple methods to get the token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,

  });

  // Check if user is authenticated
  if (!token?.email) {
    return NextResponse.json(
      { error: "Unauthorized access: Please login" },
      { status: 401 }
    );
  }

  // Add user info to headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-email", token.email as string);
  requestHeaders.set("x-user-id", token.sub || "");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/api/test/:path*",
    "/api/docs/:path*",
    "/api/chat/:path*",
  ],
};