import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "askthedocs",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
