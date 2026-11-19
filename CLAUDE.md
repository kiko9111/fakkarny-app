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
- DB columns are snake_case (`@map`), TS fields camelCase; wire types in
  packages/shared are snake_case.
- Changes to the PRD §6 data model: Item gains `remind_at` + `important` (needed by
  the response schema and F5 escalation); Message.client_id is unique per user
  (`@@unique([userId, clientId])`).
- packages/shared is consumed as TypeScript source (no build step). The API runs
  under tsx in both dev and start.
- Mobile unit tests (vitest) cover pure modules only; don't import react-native in them.
  Keep logic pure and inject storage/transport (see apps/mobile/src/sync/queue.ts).
- Identity until M5: the phone sends a random install ID in the `x-install-id` header
  (stored in SQLite `kv`); the API upserts `User.authId = "install:<id>"`
  (apps/api/src/plugins/auth.ts). M5 swaps this for Supabase JWTs.
- Messages: phone saves to SQLite (`apps/mobile/src/db/`), the outbox
  (`src/sync/`) POSTs oldest-first, the API dedupes on (user, client_id). Friend reply
  rows use client_id `<user client_id>:reply:<n>` so retries return the same replies.
- API DB tests need Postgres: set `TEST_DATABASE_URL` in apps/api/.env (they skip
  without it). Locally: `service postgresql start`; dev DB `fakkarni`, test DB
  `fakkarni_test`, user/password postgres/postgres.
- Schema change: edit apps/api/prisma/schema.prisma, then
  `npm run prisma:migrate -w @fakkarni/api -- --name <change>`. Local SQLite schema
  changes are appended to apps/mobile/src/db/schema.ts (never edit a shipped migration).

## Milestones (PRD §8)
- [x] M1 Skeleton: monorepo, Expo placeholder screens, Fastify /health, Prisma schema, shared zod types, vitest
- [x] M2 Capture and local storage: chat UI, SQLite, outbox sync, POST/GET /messages
- [ ] M3 Conversation and memory (+ evals/, real `npm run eval`)
- [ ] M4 Notifications
- [ ] M5 Auth, sync and screens
- [ ] M6 Paywall
- [ ] M7 Hardening and launch
