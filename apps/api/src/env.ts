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
  /** "1" (default): free users get a daily AI allowance; "0": unlimited for everyone. */
  REQUIRE_SUBSCRIPTION: z.enum(["0", "1"]).default("1"),
  /** Authorization header value set on the RevenueCat webhook. */
  REVENUECAT_WEBHOOK_AUTH: z.string().optional().transform((v) => v || undefined),
  /** RevenueCat secret API key (server only) to refresh a plan right after purchase. */
  REVENUECAT_SECRET_KEY: z.string().optional().transform((v) => v || undefined),
  /** Admin dashboard password (GET /admin, user "admin"). Dashboard is off without it. */
  ADMIN_PASSWORD: z.string().optional().transform((v) => v || undefined),
  SENTRY_DSN: z.string().optional().transform((v) => v || undefined),
  NODE_ENV: z.string().default("development"),
  /** Optional Expo access token if push security is enabled for the project. */
  /** Public /legal pages: who runs the service and how to reach them. */
  LEGAL_OPERATOR: z.string().optional().transform((v) => v || undefined),
  LEGAL_CONTACT_EMAIL: z.string().optional().transform((v) => v || undefined),
  /** "1" once a lawyer has reviewed apps/api/src/legal/content.ts; removes the draft notice. */
  LEGAL_REVIEWED: z.enum(["0", "1"]).default("0"),
  /** Public base URL of this API, used in invite links (e.g. https://zaki.app). Defaults to the request host. */
  PUBLIC_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  /** "1" opens Session (the reflect space). Leave off until its evals have run against the model. */
  SESSION_ENABLED: z.string().optional(),
  /** Google Play link shown on the invite page after the web confirm. */
  ANDROID_STORE_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  EXPO_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
  /** How long a caller's user row is reused on reads, in ms (plugins/auth.ts). "0" turns it off. */
  USER_CACHE_MS: z.coerce.number().int().min(0).max(60_000).default(15_000),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
