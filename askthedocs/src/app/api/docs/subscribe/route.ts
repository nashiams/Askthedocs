// app/api/docs/subscribe/route.ts - FIXED
import { NextRequest } from "next/server";
import { redis } from "@/lib/cache/redis";

export async function GET(req: NextRequest) {
  const userEmail = req.headers.get("x-user-email");
  if (!userEmail) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`Starting SSE for ${userEmail}`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ status: "connected", message: "Waiting for updates..." })}\n\n`
        )
      );

      let pollCount = 0;
      const maxPolls = 150; // 5 minutes max (2 sec intervals)

      const intervalId = setInterval(async () => {
        try {
          pollCount++;

          // Get message from Redis list
          const message = await redis.lpop(`crawl-status:${userEmail}`);

          if (message) {
            console.log("Sending message:", message);
            const data =
              typeof message === "string" ? message : JSON.stringify(message);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));

            // Check if complete
            const parsed =
              typeof message === "string" ? JSON.parse(message) : message;
            if (parsed.status === "complete" || parsed.status === "error") {
              clearInterval(intervalId);
              setTimeout(() => {
                controller.close();
              }, 1000);
            }
          } else if (pollCount >= maxPolls) {
            // Timeout after 5 minutes
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ status: "timeout", message: "No updates received" })}\n\n`
              )
            );
            clearInterval(intervalId);
            controller.close();
          }
        } catch (error) {
          console.error("SSE error:", error);
          clearInterval(intervalId);
          controller.close();
        }
      }, 2000); // Poll every 2 seconds

      // Clean up on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
