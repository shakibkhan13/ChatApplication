
import { createClient } from "redis";
import { env } from "./env";

export const redis = createClient({
  url: env.REDIS_URL,
});

redis.on("error", (error: any) => {
  console.error("Redis error", error);
});
