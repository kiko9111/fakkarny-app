# Fakkarni — paid AI friend that remembers and reminds in conversation
Stack: Expo (React Native, expo-router), SQLite, Fastify, Prisma + Postgres (Supabase),
pg-boss, zod, RevenueCat, vitest. Monorepo: apps/mobile, apps/api, packages/shared.
Full product spec: docs/PRD.pdf (section numbers below refer to it).

Rules:
- Text input only. No audio or image processing anywhere.
- The app works offline: save to SQLite first, sync later with client IDs.
- Reminders are local notifications; briefs and check-ins come from the server as push.
- The friend never replies with a checklist unless the user asks for their plans.
- Persona prompt lives in apps/api/src/persona/; every AI output is validated with zod.
- Wellbeing rules in the persona prompt are never removed or weakened.
- Store times in UTC; convert with the user's IANA time zone.
- All user-facing strings in src/i18n; Egyptian Arabic is the default; full RTL.
- Paid features check the RevenueCat entitlement "pro".
- Never log message content.
- Run `npm test` and `npm run eval` before every commit.

## Repo notes (keep current)
- Commands (from the repo root): `npm install`, `npm test`, `npm run typecheck`,
  `npm run dev:api`, `npm run dev:mobile`. Install Expo packages with
  `npx expo install <pkg>` inside apps/mobile (it picks SDK-compatible versions).
- Expo SDK 58. Its APIs change every SDK; read apps/mobile/AGENTS.md and the versioned
  docs before touching Expo APIs. Routes live in apps/mobile/src/app/ (current Expo
  convention, rather than apps/mobile/app/); non-route code goes in apps/mobile/src/*.
- Root package.json overrides `react` to the Expo SDK version, because Prisma Studio
  pulls in a newer React and expo-doctor flags the duplicate.
- Prisma 7: the DB URL is in apps/api/prisma.config.ts (read from DATABASE_URL), the
  client is generated into apps/api/src/generated/ (gitignored; `postinstall` runs
  `prisma generate`), and it connects through @prisma/adapter-pg. Use `db()` from
  apps/api/src/db.ts.
- Supabase project ref `cyvslirlrcxpyhynzxrg` (eu-west-1). Migrations through
  20261120140000_enable_rls are applied there. Every table has row level security on
  with no policies: the API connects as the table owner (bypasses RLS), and Supabase's
  public Data API gets nothing. Enable RLS in the migration of any new table. Connect
  with the session pooler (port 5432), not the transaction pooler: pg-boss needs it.
- Production API: Railway project `mellow-reverence`, service `@fakkarni/api`, built
  from the root Dockerfile and deployed from branch `claude/new-session-60jlqv` on
  every push: https://fakkarniapi-production.up.railway.app (health check /health).
  It runs with REQUIRE_SUBSCRIPTION=0 and ALLOW_INSTALL_ID=1 until the stores and
  RevenueCat are set up; flip both before launch. `tsx` is a runtime dependency of the
  API because the container starts the server with it.
- Expo: project `@kiki91111/fakkarni` (projectId in apps/mobile/app.json). The build
  variables (EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SENTRY_DISABLE_AUTO_UPLOAD) live on EAS for
  the development, preview and production environments, not in the repo. Android test
  build: `npx eas-cli@latest build --profile preview --platform android` in apps/mobile.
- DB columns are snake_case (`@map`), TS fields camelCase; wire types in
  packages/shared are snake_case.
- Changes to the PRD §6 data model: Item gains `remind_at` + `important` (needed by
  the response schema and F5 escalation); Message.client_id is unique per user
  (`@@unique([userId, clientId])`).
- packages/shared is consumed as TypeScript source (no build step). The API runs
  under tsx in both dev and start.
- Chat SQL lives in apps/mobile/src/db/sql.ts and is tested against a real SQLite
  (node:sqlite) with the migrations (sql.test.ts): the first device build showed an
  empty chat because the list query ordered a subquery by `rowid`, which no unit test
  ran. Put any new non-trivial query there and test it the same way.
- Chat layout on Android: the app is edge-to-edge, so KeyboardAvoidingView needs
  `behavior="padding"` on both platforms with the header height as offset, and a
  horizontal ScrollView (QuickReplies) needs `flexGrow: 0` or it takes half the screen.
- Sign-in buttons are shown only for providers switched on in Supabase:
  EXPO_PUBLIC_SIGNIN_GOOGLE / _PHONE / _APPLE = 1 (EAS environment variables). Email
  links are always offered.
- Mobile unit tests (vitest) cover pure modules only; don't import react-native in them.
  Keep logic pure and inject storage/transport (see apps/mobile/src/sync/queue.ts).
- Identity (apps/api/src/plugins/auth.ts): Supabase JWT in `Authorization: Bearer`
  (verified via SUPABASE_URL's JWKS, or SUPABASE_JWT_SECRET) → `authId "supabase:<sub>"`;
  otherwise the phone's random install ID (`x-install-id`) → `"install:<id>"`, unless
  ALLOW_INSTALL_ID=0. After sign-in the phone calls POST /auth/link to move its
  pre-sign-in data to the account, then pulls everything (apps/mobile/src/sync/full.ts).
  Every route plugin gets the same `authenticate` hook from buildApp.
- Sign-in methods (apps/mobile/src/auth): one field takes an email or a phone number
  (`parseContact`, pure). Email → Supabase mails a sign-in link that reopens the app at
  `auth/callback` (route src/app/auth/callback.tsx, PKCE code exchange shared with the
  Google flow via `completeCallback`). It is a link, not a code, because Supabase's
  free built-in mailer cannot use a custom template (and sends about 2 emails an hour:
  set up custom SMTP before launch). Phone → SMS code (needs an SMS provider). The
  Supabase redirect allow list has `fakkarni://auth/callback` and `exp://**` (Expo Go).
- Legal pages: GET /legal/terms and /legal/privacy on the API (?lang=en, Arabic by
  default), text in apps/api/src/legal/content.ts, linked from the paywall and
  Settings. They show a draft notice until LEGAL_REVIEWED=1; set LEGAL_OPERATOR and
  LEGAL_CONTACT_EMAIL. Keep the privacy text in step with what the code collects.
- Mobile config: apps/mobile/.env.local with EXPO_PUBLIC_SUPABASE_URL and
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sign-in is hidden without them). Small sync
  prefs (language, always_direct, onboarded) live in src/lib/prefs.ts (expo-sqlite
  localStorage) so the language/RTL is known before the first render.
- Messages: phone saves to SQLite (`apps/mobile/src/db/`), the outbox
  (`src/sync/`) POSTs oldest-first, the API dedupes on (user, client_id). Friend reply
  rows use client_id `<user client_id>:reply:<n>` so retries return the same replies.
- API DB tests need Postgres: set `TEST_DATABASE_URL` in apps/api/.env (they skip
  without it). Locally: `service postgresql start`; dev DB `fakkarni`, test DB
  `fakkarni_test`, user/password postgres/postgres.
- Conversation pipeline (apps/api/src/pipeline/conversation.ts): rules fast path
  (rules.ts: thanks/emoji, crisis keyword safety net) → context (context.ts: ~20
  ranked memories, open items with ids, rolling summary, last 15 messages, local NOW)
  → one Claude call (src/ai/model.ts, `claude-haiku-5-5`, structured output, persona
  system prompt cached) → strict zod validation → apply.ts in a transaction. Model
  times are local wall-clock, converted with src/lib/time.ts. The context also carries
  UPCOMING DAYS (14 dated weekdays, so the model looks dates up instead of computing
  them) and REPLY SCRIPT (decided in code from the last message's letters); a reply
  with Arabic letters to a Latin-letter message gets one retry (`latinOnly`). Every call logs an
  `ai_call` Event with tokens + cost (no content). The pipeline is injected into
  buildApp, so tests use a scripted fake model.
- The app's Anthropic client ignores the shell's ANTHROPIC_BASE_URL on purpose
  (override with FAKKARNI_ANTHROPIC_BASE_URL). The server needs ANTHROPIC_API_KEY or
  the friend won't reply (messages are still stored).
- Evals: evals/cases/*.jsonl (one case per line; default NOW is Thu 2026-11-19 10:00
  Cairo). `npm run eval` validates cases and, with ANTHROPIC_API_KEY (or
  FAKKARNI_ANTHROPIC_API_KEY: Claude Code cloud sessions drop ANTHROPIC_API_KEY from
  the shell, so set that name in the cloud environment instead), scores
  extraction (target 90%) + style checks, writing evals/out/review.csv for blind
  native review. Add every message the friend gets wrong as a new line.
  Last measured (persona 2026-11-20.1+, 101 cases): extraction 98–100%, style 100%
  across runs; the baseline before tuning was 76% / 76%. Scores move a case or two
  between runs, so run twice before concluding a prompt change helped or hurt.
- Helpline numbers in apps/api/src/persona/prompt.ts were checked against official
  sources on 2026-11-20 (Egypt now leads with 16328). Still to do before launch: one
  test call per number, and a re-check before each release.
- Subscriptions (M6): RevenueCat app user id = our User.id. POST /webhooks/revenuecat
  (Authorization = REVENUECAT_WEBHOOK_AUTH) mirrors the plan onto User; POST
  /me/plan/refresh re-reads it with REVENUECAT_SECRET_KEY right after a purchase.
  With REQUIRE_SUBSCRIPTION=1, POST /messages returns 402 after
  FREE_MESSAGES_BEFORE_PAYWALL messages without an active plan (apps/api/src/billing).
  The phone keeps 402'd messages queued and swaps the input for the paywall CTA.
  Locked users get no proactive messages; trial users get one honest notice 2 days
  before the trial ends. Local dev: REQUIRE_SUBSCRIPTION=0 in apps/api/.env.
- Hardening (M7): @fastify/rate-limit (120/min per caller, 30/min on POST /messages,
  keyed by hashed identity), soft daily cap of 150 user messages (AI pauses, messages
  still saved, user told once), Sentry on API and app with all content collection off,
  in-memory error-rate metrics, GET /admin (Basic auth, ADMIN_PASSWORD; counts and
  costs only, never chat content). Deploy the API with the root Dockerfile; build the
  app with apps/mobile/eas.json profiles (development / preview / production).
- Proactive messages (M4): pg-boss cron `proactive-tick` every minute
  (apps/api/src/jobs) → `planProactive` (pure; decides morning/night/check-in/
  follow-up from the clock, items and user state) → `writeProactive` (short AI prompt,
  template fallback) → stored as a friend Message + Expo push. The phone pulls them
  with GET /messages?after=. Set DISABLE_JOBS=1 to run an API without the scheduler.
- Reminders are local notifications on the phone (apps/mobile/src/notifications):
  `planReminderNotifications` (pure) → indirect hint at remind time + clear backup
  near the deadline; quick replies Done/Later. Remote push needs a dev build and an
  EAS projectId in app.json (`extra.eas.projectId`); local reminders work in Expo Go.
- Schema change: edit apps/api/prisma/schema.prisma, then (non-interactive shells)
  `mkdir prisma/migrations/<timestamp>_<name>` and
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > .../migration.sql`,
  then `npx prisma migrate deploy` (in apps/api, DATABASE_URL set). Interactive:
  `npm run prisma:migrate -w @fakkarni/api -- --name <change>`. Local SQLite schema
  changes are appended to apps/mobile/src/db/schema.ts (never edit a shipped migration).

## Milestones (PRD §8)
- [x] M1 Skeleton: monorepo, Expo placeholder screens, Fastify /health, Prisma schema, shared zod types, vitest
- [x] M2 Capture and local storage: chat UI, SQLite, outbox sync, POST/GET /messages
- [x] M3 Conversation and memory: persona, pipeline, Saved chip fixes, evals (101 cases; extraction ≥98%, native review of evals/out/review.csv still pending). Reply streaming deferred.
- [x] M4 Notifications: local reminders + quick replies, push registration, pg-boss proactive messages with auto-slowdown
- [x] M5 Auth, sync and screens: Supabase sign-in (email link, phone OTP, Apple, Google), account linking + full sync, Upcoming/Money/Settings/Memories, export, delete. Home-screen widget (P1) deferred: expo-widgets needs the bundle ID and a dev build.
- [x] M6 Paywall: RevenueCat purchase/restore, webhook + refresh, chat lock (data readable), trial-ending notice
- [x] M7 Hardening: Sentry, rate limits + daily cap, retries, admin dashboard with AI cost per user, EAS profiles, Dockerfile. Store submission steps are manual (see README launch checklist).
