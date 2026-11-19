import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  /** Set to "1" to run an API instance without the proactive-message scheduler. */
  DISABLE_JOBS: z.string().optional(),
  /** Optional Expo access token if push security is enabled for the project. */
  EXPO_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
