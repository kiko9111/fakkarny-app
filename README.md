# Fakkarni (فكّرني)

An AI friend that chats in Egyptian Arabic, Franco or English, remembers what you
mention, and reminds you the way a friend would. Paid iOS/Android app. The spec is in
[docs/PRD.pdf](docs/PRD.pdf), and the working rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Layout
```
apps/mobile      Expo app (expo-router, SDK 58): chat, Upcoming, Money, Settings, paywall
apps/api         Fastify API: conversation pipeline (Claude Haiku), pg-boss jobs, Prisma/Postgres
packages/shared  zod schemas + types shared by app and API
evals/           eval cases (Arabic, Franco, English) + `npm run eval`
```

## Run it locally
Requires Node 20+ and Postgres.
```sh
npm install
cp apps/api/.env.example apps/api/.env        # set DATABASE_URL (and TEST_DATABASE_URL for DB tests)
cd apps/api && npx prisma migrate deploy && cd ../..
npm test                  # unit + DB tests in every workspace
npm run typecheck
npm run eval              # validates eval cases; scores the friend when ANTHROPIC_API_KEY is set

npm run dev:api           # http://localhost:3000/health  (admin: /admin with ADMIN_PASSWORD)
npm run dev:mobile        # scan the QR code with Expo Go (local reminders, chat, screens)
```
Push notifications, Apple sign-in, RevenueCat purchases and widgets need a
**development build** (`npx eas-cli@latest build --profile development`), not Expo Go.

## Configuration
| Where | Variable | What for |
|---|---|---|
| apps/api/.env | `DATABASE_URL` | Postgres (Supabase) |
| | `ANTHROPIC_API_KEY` | The friend's replies and memory (without it, messages are stored but get no reply) |
| | `SUPABASE_URL` (+ `SUPABASE_SERVICE_ROLE_KEY`) | Verify sign-in tokens; delete auth users on account deletion |
| | `ALLOW_INSTALL_ID` | `0` in production to require sign-in |
| | `REQUIRE_SUBSCRIPTION`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_KEY` | Paywall and RevenueCat webhook |
| | `ADMIN_PASSWORD`, `SENTRY_DSN`, `EXPO_ACCESS_TOKEN` | Admin dashboard, error tracking, push security |
| apps/mobile/.env.local | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sign-in |
| | `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Purchases |
| | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN` | API location (optional in dev), crash reports |

## Launch checklist (manual steps from PRD §8)
- [x] Bundle ID `com.fakkarni.app` (iOS + Android) is set in `apps/mobile/app.json`. Run `eas init` (adds `extra.eas.projectId`, needed for push).
- [ ] Supabase: create the project, enable Phone (SMS provider), Apple and Google providers, add `fakkarni://auth/callback` as a redirect URL.
- [ ] RevenueCat: products (monthly, yearly, 7-day trial) in App Store Connect and Google Play, entitlement `pro`, current offering with monthly + annual packages, webhook to `https://<api>/webhooks/revenuecat` with the `REVENUECAT_WEBHOOK_AUTH` header.
- [ ] Set `ANTHROPIC_API_KEY`, run `npm run eval -- --strict` until extraction ≥ 90%, and have native speakers rate `evals/out/review.csv` (target 90% "sounds like a friend").
- [ ] Helpline numbers in `apps/api/src/persona/prompt.ts` were checked against official sources on 2026-11-20; make one test call per number before launch.
- [ ] Deploy the API (root `Dockerfile`) to Railway or Fly.io with `REQUIRE_SUBSCRIPTION=1`, `ALLOW_INSTALL_ID=0`, `ADMIN_PASSWORD`, `SENTRY_DSN`.
- [ ] Sentry source maps: `npx @sentry/wizard@latest -i reactNative` in apps/mobile.
- [ ] Add Terms of Use and Privacy Policy links to the paywall and store listings (required by Apple).
- [ ] `eas build --profile production`, TestFlight + Google Play internal testing with 50 users, store listings in Arabic and English, submit.
