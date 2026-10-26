
import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
});

const runtimeEnv = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process.env;

export const env = envSchema.parse(runtimeEnv);
