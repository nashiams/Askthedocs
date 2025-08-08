// lib/cache/redis.ts
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL!;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN!;

// Create main Redis instance
export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

export const redisPublisher = new Redis({
  url: redisUrl,
  token: redisToken,
});

export const redisSubscriber = new Redis({
  url: redisUrl,
  token: redisToken,
});
