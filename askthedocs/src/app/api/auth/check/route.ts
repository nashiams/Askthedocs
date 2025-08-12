import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(request: NextRequest) {
  try {
    // Check JWT token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    // Get cookies
    const cookies = request.cookies.getAll();
    
    return NextResponse.json({
      authenticated: !!token,
      token: token ? {
        email: token.email,
        name: token.name,
        picture: token.picture,
      } : null,
      cookies: cookies.map(c => ({
        name: c.name,
        hasValue: !!c.value
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      authenticated: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
  }
}