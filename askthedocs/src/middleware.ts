// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  try {
    // Try different cookie names for NextAuth v5
    const cookieNames = [
      "authjs.session-token",           
      "authjs.pkce.code_verifier",      
      "__Secure-authjs.session-token", 
      "__Host-authjs.session-token",   
    ];

    let token = null;

    // Try each cookie name
    for (const cookieName of cookieNames) {
      try {
        token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET,
          cookieName: cookieName,
        });
        
        if (token) {
          console.log(`Token found with cookie name: ${cookieName}`);
          break;
        }
      } catch (e) {
        // Continue to next cookie name
        continue;
      }
    }
    if (!token) {
      token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      });
    }

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
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 }
    );
  }
}

export const config = {
  matcher: [
    "/api/test/:path*",
    "/api/docs/:path*",
    "/api/chat/:path*",
  ],
};