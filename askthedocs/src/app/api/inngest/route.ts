import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { crawlDocumentation } from "@/inngest/functions/crawl-documentation";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [crawlDocumentation],
});
