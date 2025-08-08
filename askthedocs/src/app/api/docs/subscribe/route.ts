// app/api/docs/subscribe/route.ts - Updated for Upstash
import { redis } from "@/lib/cache/redis";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const userEmail = req.headers.get("x-user-email");
  if (!userEmail) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  // For Upstash, we need to poll instead of true subscribe
  // because Upstash Redis REST API doesn't support long-lived connections
  const stream = new ReadableStream({
    async start(controller) {
      const channel = `crawl-${userEmail}`;
      let isActive = true;

      // Poll for messages
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // In Upstash, we'd typically use a list or stream instead of pubsub for this
          // Let's use a different approach with lists
          const rawMessage = await redis.lpop(`queue:${channel}`);
          let message: any = null;
          if (rawMessage) {
            try {
              message =
                typeof rawMessage === "string"
                  ? JSON.parse(rawMessage)
                  : rawMessage;
            } catch {
              message = { status: undefined, data: rawMessage };
            }
          }

          if (message) {
            const event = `data: ${JSON.stringify(message)}\n\n`;
            controller.enqueue(encoder.encode(event));

            // Check if complete
            if (message.status === "complete" || message.status === "error") {
              isActive = false;
              setTimeout(() => {
                controller.close();
              }, 1000);
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 1000); // Poll every second

      // Cleanup
      req.signal.addEventListener("abort", () => {
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
