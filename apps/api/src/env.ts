import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  /** Set to "1" to run an API instance without the proactive-message scheduler. */
  DISABLE_JOBS: z.string().optional(),
  /** Supabase project URL: verifies sign-in tokens via its JWKS. */
  SUPABASE_URL: z.string().url().optional(),
  /** Only for legacy HS256 Supabase projects. */
  SUPABASE_JWT_SECRET: z.string().optional().transform((v) => v || undefined),
  /** Lets account deletion also delete the Supabase auth user. Server-side only. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().transform((v) => v || undefined),
  /** "0" in production once sign-in is required; "1" (default) accepts the phone's install ID. */
  ALLOW_INSTALL_ID: z.enum(["0", "1"]).default("1"),
  /** Optional Expo access token if push security is enabled for the project. */
  EXPO_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
