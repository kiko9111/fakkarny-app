# Zaki (formerly Fakkarni) — AI friend that remembers, reminds, and helps with family and friends
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
- Check the installed skills and use any that fit before starting a task.

## Skills, plugins and MCP (shared by every session)
- Plugins, enabled in .claude/settings.json from their marketplaces: superpowers,
  task-observer, impeccable, agent-skills (Addy Osmani). Skills copied into .claude/skills/:
  find-skills, graphify, and seven Strix security-testing skills.
- Context7 (library docs) is in .mcp.json, keyless (lower rate limit).
- Strix skills: use their testing checklists only. Do not install the Strix scanner, Docker,
  or sign up for app.strix.ai.
- graphify: the skill installs its own CLI (`graphifyy` from PyPI) on first `/graphify`.
  When graphify-out/graph.json exists, run `graphify query "<question>"` before grepping or
  reading source for a codebase question, and `graphify update .` after code changes. The
  hooks in .claude/settings.json do nothing while the CLI is not installed.
- impeccable's hooks (Edit/Write and Stop) download its checksum-verified engine binary from
  GitHub releases on first run, into ~/.impeccable.

## Repo notes (keep current)
- Brand (owner decision, 2026-11-22): the app and its AI character are **Zaki** (زكي), super
  positive and warm. User-visible text says Zaki/زكي. Internal IDs keep the old name
  (Android package / bundle ID `com.fakkarni.app`, Expo slug and scheme `fakkarni`, npm
  workspaces `@fakkarni/*`, DB names) unless the owner decides otherwise. The Arabic home
  screen name comes from apps/mobile/locales/ar.json. "فكّرني" in strings is the verb
  ("remind me"), not the brand: don't rename those.
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
  The cloud session can't reach expo.dev, so .github/workflows/android-build.yml starts that
  build from GitHub (secret EXPO_TOKEN) whenever a pushed commit message contains
  "[android-build]"; the EAS build page link is the install link for testers.
- EAS Update is configured (updates.url, runtimeVersion policy appVersion; channels
  development / preview / production). Builds made after 2026-11-21 can take
  JavaScript-only fixes over the air: `npx eas-cli@latest update --branch preview
  --environment preview`. iPhone without an Apple Developer account: the app is
  published for Expo Go on branch `expo-go` with runtime `exposdk:58.0.0` (temporarily
  set runtimeVersion policy to sdkVersion for that publish, do not commit it); open it
  from Expo Go signed in to the Expo account. Purchases, Sentry and push do not work there.
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
  (`parseContact`, pure). Email → a 6-digit code typed into the app (`verifyOtp`, type
  "email"). Supabase sends through custom SMTP (a Gmail account with an app password,
  set in the dashboard on 2026-11-21); the code template and the 60-an-hour limit were
  set through the management API. Before that, the built-in mailer allowed about 2
  emails an hour for the whole project and could not send a code. The `auth/callback`
  route stays for the Google redirect. Phone → SMS code (needs an SMS provider). Move
  to a sending service with the project's own domain before public launch.
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
  without it, silently: check the test summary says 0 skipped). Claude Code cloud
  sessions have Postgres installed: `service postgresql start`, set the postgres
  password, `createdb fakkarni_test`, then write apps/api/.env. Locally: `service postgresql start`; dev DB `fakkarni`, test DB
  `fakkarni_test`, user/password postgres/postgres.
- Conversation pipeline (apps/api/src/pipeline/conversation.ts): rules fast path
  (rules.ts: thanks/emoji, crisis keyword safety net) → context (context.ts: ~20
  ranked memories, open items with ids, rolling summary, last 15 messages, local NOW)
  → one Claude call (src/ai/model.ts, `claude-haiku-5-5` at medium effort, structured output, persona
  system prompt cached) → strict zod validation → apply.ts in a transaction. Model
  times are local wall-clock, converted with src/lib/time.ts. The context also carries
  UPCOMING DAYS (14 dated weekdays, so the model looks dates up instead of computing
  them), REPLY SCRIPT and ADDRESS THE USER AS (both decided in code). Every call logs an
  `ai_call` Event with tokens + cost (no content). The pipeline is injected into
  buildApp, so tests use a scripted fake model.
- Reply language (owner decision, 2026-11-21, replaces the PRD's "Franco → Franco"):
  the friend reads Franco but never writes it. Arabic and Franco messages are answered
  in Egyptian Arabic in Arabic letters (titles, nudges and names too); English in
  English. `detectScript` (rules.ts) classifies the input, `replyLang` maps it, the
  context states REPLY SCRIPT and ADDRESS THE USER AS (masculine until a memory says
  "المؤنث"), and a reply without Arabic letters gets one retry (`requireArabic`). The
  persona carries the colloquial-not-Modern-Standard rules and a Franco reading glossary.
- The friend runs `claude-haiku-5-5` at effort "medium": at "low" it invented details
  when reading Franco. Override with FAKKARNI_FRIEND_EFFORT / FAKKARNI_FRIEND_MODEL.
- The app's Anthropic client ignores the shell's ANTHROPIC_BASE_URL on purpose
  (override with FAKKARNI_ANTHROPIC_BASE_URL). The server needs ANTHROPIC_API_KEY or
  the friend won't reply (messages are still stored).
- Evals: evals/cases/*.jsonl (one case per line; default NOW is Thu 2026-11-19 10:00
  Cairo). `npm run eval` validates cases and, with ANTHROPIC_API_KEY (or
  FAKKARNI_ANTHROPIC_API_KEY: Claude Code cloud sessions drop ANTHROPIC_API_KEY from
  the shell, so set that name in the cloud environment instead), scores
  extraction (target 90%) + style checks, writing evals/out/review.csv for blind
  native review. Add every message the friend gets wrong as a new line.
  Last measured (persona 2026-11-21.5, 137 cases, effort medium): extraction 98–99%,
  style 100% across runs; the baseline before tuning was 76% / 76%. Cases named
  `talk-*` and `real-*` come from real device chats; `reply_none` and `no_memories` catch nagging
  ("anything tomorrow?"), Modern Standard words and memories saved for small talk. Scores move a case or two
  between runs, so run twice before concluding a prompt change helped or hurt.
- Helpline numbers in apps/api/src/persona/prompt.ts were checked against official
  sources on 2026-11-20 (Egypt now leads with 16328). Still to do before launch: one
  test call per number, and a re-check before each release.
- Plans and AI allowance (Zaki M2, 2026-11-22; replaces the old chat lock). Chat is
  never locked and POST /messages no longer returns 402. Shared features are free and
  unlimited; AI depth is paid. With REQUIRE_SUBSCRIPTION=1 a free user gets 30 AI
  messages a day in their first 7 days, then 5 a day (`dailyAiAllowance`,
  apps/api/src/billing/plan.ts). The count is today's `ai_call` events with purpose
  "chat", so messages answered by rules cost nothing; crisis messages are never
  blocked. Over the allowance the pipeline stores a canned Zaki reply of kind "upsell"
  (first of the day mentions Pro), which the phone shows with a "See Zaki Pro" button.
  POST /messages returns `ai_allowance {limit, used}`. Proactive messages go to everyone.
  Pro = active plan or `bonus_pro_until` in the future (`hasPro`; wire field `user.pro`).
- Store products (to create in Play/App Store + RevenueCat, all granting entitlement
  "pro"): zaki_pro_monthly (EGP 129), zaki_pro_yearly (EGP 999), zaki_family_monthly
  (EGP 179), zaki_family_yearly (EGP 1,499), zaki_founders_yearly (EGP 499 first year,
  first 1,000 buyers; GET /billing/offers returns founders_left). Tier and founders are
  read from the product id ("family", "founder") on both server and phone
  (apps/mobile/src/billing/options.ts). Sharing Family with up to 6 members comes with
  circles (not built yet). RevenueCat app user id = our User.id; POST
  /webhooks/revenuecat mirrors plan, plan_tier and plan_product_id onto User; POST
  /me/plan/refresh re-reads it right after a purchase.
- Invite rewards: GET /me/referral (code + days this month), POST /referrals/claim
  {code}. A signed-in user in their first week names their inviter once; the inviter
  gets 7 Pro days, at most 28 per calendar month (apps/api/src/billing/referral.ts).
  Joining a circle through an invite link claims the reward for the inviter too.
- Circles (Zaki M3): the Friends and Family spaces. Tables circles / circle_members /
  invites; routes in apps/api/src/routes/circles.ts (members only; owner renames,
  removes, deletes; when the owner leaves the longest-standing member takes over).
  Circles are free: the limits in apps/api/src/circles/rules.ts (50 members, 100
  circles) are abuse guards, not product caps. Circles are server-only, not in SQLite:
  the Circles tab needs a connection.
- Invite links: POST /circles/:id/invites returns a multi-use link (valid 30 days, one
  live link per member per circle) and the WhatsApp text; the phone opens
  https://wa.me/?text=… so it goes out from the user's own number (never a WhatsApp
  bot). The link is a public page served by the API, GET /i/:code
  (apps/api/src/routes/invite-page.ts): confirm first with nothing to install, then
  the store button (ANDROID_STORE_URL), a fakkarni://invite/CODE deep link and the
  typeable code. The web tap only counts (`web_confirms`); joining happens in the app
  (POST /invites/:code/accept, route apps/mobile/src/app/invite/[code].tsx). An invite
  opened before onboarding is kept in prefs `pending_invite` and resumed after. Set
  PUBLIC_URL so links use the real domain. The server runs with trustProxy so the
  public page is rate-limited per visitor.
- Shared Daftar (Zaki M4): table daftar_entries, routes apps/api/src/routes/daftar.ts,
  wording and state rules in apps/api/src/daftar/rules.ts (pure). The creator records a
  debt and sends a link from their own WhatsApp; the other person answers on the public
  page GET /d/:code (apps/api/src/routes/daftar-page.ts) with POST forms, so a link
  preview can never answer for them. Statuses: pending → confirmed | disputed →
  settled, or cancelled by the creator. Only the two people ever see an entry, each
  from their own side (`toWireEntry` flips the direction). Opening fakkarni://daftar/CODE
  in the app (POST /daftar/open/:code) links the entry to that account. An entry can
  also go straight to a circle member (`other_user_id`), with no link.
  Zaki nudges the other person only after they confirmed: POST /daftar/:id/share
  returns the confirm link while pending and the gentle reminder only once confirmed.
  When something happens, Zaki tells the other side in their chat with a Message of
  kind "update" (no AI call, client_id `daftar:<id>:<event>`).
- Assigned tasks (Zaki M5): tables circle_tasks and circle_posts, routes
  apps/api/src/routes/tasks.ts, rules and wording in apps/api/src/tasks/rules.ts (pure),
  writes in apps/api/src/tasks/store.ts. Accept first: a request is only between the two
  people (chat line kind "update" + free push via proactive/notify.ts) until the assignee
  says yes. On yes it becomes an Item of theirs (circle_tasks.item_id) and Zaki posts in
  the circle. Marking that item done anywhere (PATCH /items, or in chat via
  pipeline/apply.ts) finishes the task through `finishForItems`. Nudges are sent only
  when the assigner asks (every 12 h, 3 per task). Circle posts are stored as an event
  plus ids and written per reader language by `postLine`; never store model text there.
  Arabic lines about another person avoid gendered verbs. All of this is free: no AI call.
- Trackers (Zaki M6): tables trackers and tracker_entries, routes
  apps/api/src/routes/trackers.ts, kinds and defaults in packages/shared/src/trackers.ts.
  Stats (today, 7 days, streak) are pure in apps/api/src/trackers/stats.ts and always use
  the user's local day. Chat feeds trackers by rules only (apps/api/src/trackers/match.ts,
  called from pipeline/conversation.ts step 1a): "شربت مية" logs, "تابع معايا المية"
  starts one; no AI call, no allowance used. The rules are strict on purpose: plans,
  reminders, questions, negations and debts must fall through to the model, and a kind
  the user does not follow is never matched. Free plan keeps FREE_TRACKERS (1); a second
  one returns 402 tracker_limit (app opens the paywall). Logging is never limited.
- GET /me/export must include every new kind of user data (circles, Daftar, tasks,
  trackers are in). Add to it whenever a table holding user data is added.
- Check-ins and family roles (Zaki M7): circles.family_type and circle_members.family_role
  (plain text, validated by shared FamilyType / FamilyRole). A check-in is a circle_posts
  row with event `checkin:<kind>` and the optional note in `title`; it is pushed to the
  other members (no chat message) and shown as each member's `last_checkin`. Check-ins are
  words the member chose, never a location: do not add location to them. "Ask to check
  in" writes one chat line + push to the target, at most once per 3 hours per pair (the
  message client_id carries the time bucket). `checkinOrder` in shared decides button
  order per family type.
- Session (Zaki M8, "a space to reflect"): routes apps/api/src/routes/session.ts, turn
  logic apps/api/src/session/store.ts, fixed wording and limits in session/rules.ts, prompt
  in apps/api/src/persona/session.ts. Rules that must hold:
  - Never called therapy, in any string or prompt. Every session opens with the template
    "not a doctor" line. The prompt's SAFETY section is never removed or weakened (same
    standing as WELLBEING).
  - Crisis safety net as in the main chat: keyword check on every message, helpline number
    always in the reply, no step, works even when the model fails. Never blocked by limits.
  - Sensitive data: own tables (session_consents, reflect_sessions, reflect_messages), own
    consent (18+ tick and agree tick), DELETE /session wipes it all. Nothing from Session is
    read by the chat context, memories, summaries, trackers or circles, and event props
    never carry content or mood. The only thing that leaves is a step title, when the user
    taps "Remind me".
  - 18+: anyone with family_role "teen" in any circle is refused.
  - Off unless SESSION_ENABLED=1 (and a model key is set). Do not turn it on in production
    before the Session evals have been run and read.
  - Free: 1 session per 7 days; Pro unlimited; 30 user messages per session.
  Records only: never hold or move money (Central Bank rules).
- Ramadan pack and iftar (Zaki M9): `RAMADAN_SEASONS` in packages/shared/src/trackers.ts
  holds the dates (add next year's there). In season, POST /trackers/ramadan-pack adds
  the pack trackers (fasting, prayers, Quran, charity) marked `pack`, which do not count
  against the free tracker limit; out of season it answers 409 `not_in_season`. Iftar
  invitations are circle posts (event `iftar`, RSVP events `rsvp:yes|no`) written by
  templates in tasks/rules.ts: POST /circles/:id/iftar and
  POST /circles/:id/posts/:postId/rsvp. No AI call anywhere in the pack.
- Session evals: `npm run eval:session` (evals/session.ts, cases in
  evals/session/cases.jsonl, scoring in evals/session-score.ts). Without a model key it
  only validates the cases. Launch steps and the store listing text: docs/launch.md.
- InstaPay: there is no public deep link that pre-fills an amount. Users paste their own
  InstaPay payment link (https://ipn.eg/…, validated by `parseInstapayLink`) in
  Settings; whoever owes them gets a "Pay with InstaPay" button that opens it, and the
  amount is shown to type there.
- Old app builds: the first build rejects any message kind it does not know and its chat
  sync then jams for good. `toWireMessage` sends "upsell" and "update" as "chat" unless
  the request carries `x-message-kinds: 2` (sent by the app since Zaki M9). When adding a
  message kind or any enum value the phone parses, gate it the same way.
- The public pages share apps/api/src/web/shell.ts (escape every user value with `esc`).
- Family plan sharing: a member with an active plan of tier "family" covers 6 people in
  all: the payer plus the first 5 others by join time across all of the payer's family
  circles, never 6 per circle (apps/api/src/billing/family.ts); used for the AI allowance
  and GET /me `pro`.
- Past the free AI allowance (pipeline/conversation.ts) two kinds of message still reach the
  model and don't count against it (`ai_call` purpose "chat_free"): distress
  (`looksDistressed`, a wider net than the crisis keywords; never limited) and reminder work
  (`looksLikeReminderWork`: asking for a reminder, the notification's Done / Later lines, a
  tracker log that answers an open reminder; FREE_REMINDER_CALLS_PER_DAY). Session's 30-message
  cap also lets distress through.
- Account deletion (DELETE /me) hands owned circles to the longest-standing member, deletes
  circles left empty, and deletes circle_posts by or about the user (no FK on those ids).
- The phone pulls items changed on the server outside the chat (accepted tasks, Session steps,
  cancelled tasks) on every foreground with `pullItems` (apps/mobile/src/sync/items.ts) and
  re-plans their notifications.
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
- Status checks (owner ask, 2026-11-22: "ask the status of everything, not just remind"):
  apps/api/src/proactive/status.ts (pure, tested) picks one subject per tick, in order: a
  reminder/task whose time passed 45 min to 3 days ago and is still open, a debt open 7+ days,
  an untimed task 3+ days old, and from 18:00 a tracker with nothing logged today. Template
  words only (no AI call), stored as kind "followup" with client_id
  `status:<item|tracker>:<id>:<iso>`, pushed like other proactive messages, and they take the
  place of a plain check-in. Not nagging: waking hours away from the morning/night windows,
  never within 30 min of the user's last message, max 2 a day, 3 h apart, per-subject
  cool-downs, and a 48 h pause after 2 unanswered in a row. In the chat pipeline a plain yes
  (`isPlainYes`) to the latest status check marks the item done or logs one tracker step by
  rules; any other answer goes to the model as free reminder work.
- Everything shows in the chat (owner decision, 2026-11-21). The local notification
  still fires on the phone, and `postDueReminders` (proactive tick) writes the same
  nudge into the chat as a friend Message of kind "reminder" (client_id
  `reminder:<itemId>:<remindAt>`, no push). Done / Later on the notification also send
  a normal chat message ("خلصت «…» ✅"), which the friend answers and acts on.
- Repeating reminders ("every hour"): Item.repeat_every_minutes (server column, shared
  types, phone SQLite v3). `nextOccurrences` in packages/shared/src/repeat.ts is used
  by both sides from the same anchor: the tick posts the chat message and moves
  remind_at to the next waking-hours occurrence; the phone schedules the next 16 local
  notifications and tops them up whenever the app returns to the foreground. Done on a
  repeating reminder does not close it; "stop reminding me" cancels it. The phone
  assumes waking hours 07:00–23:00 (the server uses the user's settings).
- Follow-ups ("how was the dentist, did it hurt?"): the persona sets follow_up_at for
  events with an outcome; the tick writes the question (not counted against the daily
  cap); the phone shows a local notification at the same time, because remote push
  needs FCM credentials that are not set up yet (devices register no push token).
- A short Latin message with no language of its own ("yara", "ok") follows the
  conversation: `detectScriptInContext` (rules.ts).
- Message order on the phone: a synced user message takes the server's `created_at`.
  Replies carry server time, so with a phone clock running ahead every reply used to
  sort above the message it answered.
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
- Design system (2026-11-22): apps/mobile/src/ui (tokens, Text, Button, Icon, ZakiAvatar,
  parts, TextField, feedback, ThemePicker, glass). Screens use it, not src/lib/theme (kept only as
  an alias). Look = the liquid-glass logo (owner pick): a soft colour mesh behind every screen
  (assets/bg/mesh-*.jpg via `Backdrop`; navigators use `screenLayout={withGround}` so each screen
  carries its own mesh and mounted screens underneath never show through; headers use
  `GlassHeader`), frosted translucent surfaces (`glass` token: white 68% + bright edge + tinted
  shadow; real backdrop blur on web only), large radii, glossy pill buttons. No blur or gradient
  native module: the mesh and Zaki art are images. Themes the user picks: Sunrise (default), Mint
  or Cloud (src/ui/themes.ts, prefs "theme", read at start-up; changing it reloads). Session has
  its own calm mesh. Family, friends and Session keep fixed colours in every theme. One font
  family, IBM Plex Sans Arabic; Ionicons; no emoji on buttons/chips (`plain()`). Use
  `notify`/`confirm`/`ask` from src/ui/feedback instead of Alert. Dates use `dateLocale`.
- Logo and icons: the liquid-glass spark smile. The app icon, Android adaptive layers, splash,
  favicon and the in-app Zaki art (assets/zaki/zaki-<theme>-<happy|calm>.png) are rendered from one
  SVG; keep them in step if the mark changes. The splash is configured through the
  expo-splash-screen plugin in app.json.
- Chat first (owner decision, 2026-11-22): a new user sees only Zaki's chat (no tab bar,
  Settings in the header). Daftar opens on money talk, People on family/friends words or an
  accepted invite, Today after 3 active days (src/lib/unlock.ts, pure + tested; state in
  prefs "unlocked" via src/lib/unlock-store.ts). No saved state = a user from before this
  change: everything stays open. Story: "Zaki remembers so you don't have to".
- Native modules: existing builds take JS over the air (runtimeVersion appVersion), so
  a new native module must be optional: check `requireOptionalNativeModule` and require it
  lazily (see src/lib/contacts.ts, expo-contacts for "Pick from contacts" in Daftar, which
  asks permission only on tap and reads only the picked name).
- Browser preview: `node scripts/build-web-preview.mjs out.html` in apps/mobile builds a
  single-file web app on sample data (EXPO_PUBLIC_DEMO=1, fake API in src/demo/server.web.ts,
  SQLite on sql.js). `*.web.ts` files keep the native bundle unchanged. The script inlines
  fonts, PNG and JPG assets; add any new asset type to it.
- Custom circles and extras (2026-11-22): any circle name; every circle gets every feature.
  Extras (weekly summary, more than one nudge per task, @Zaki summary) are free for 14 days
  from the circle's creation, then need Pro (`circleExtras` in packages/shared/src/circles.ts;
  402 `circle_extras` opens the paywall). Off while REQUIRE_SUBSCRIPTION=0.
- Task reminder time and homework: circle_tasks.remind_at / homework / note. The assigner sets
  when Zaki reminds (while pending), the assignee can change it (POST /tasks/:id/remind,
  `canSetRemind`); on accept the Item gets remind_at ?? due_at. Homework is a task flag with a
  note/link the child opens and taps done on.
- Tracker builder: trackers.ask_times (local "HH:MM", max 3), unit_label, circle_id (shared
  with a circle; money trackers never shared; leaving a circle unshares). Zaki asks at those
  times (`trackerAskDue`, proactive tick, status client_id so a plain yes logs a step). A
  shared tracker reaching its goal posts `tracker_goal` in the circle. Chat suggests trackers
  (`suggestTracker`, mobile, pure).
- Wider Daftar (money): tables money_sections / money_entries, routes apps/api/src/routes/money.ts,
  rules apps/api/src/money/rules.ts (pure). Sections start empty; budgets warn at 80% and
  100% once per month in the chat (client_id `budget:<id>:<month>:<level>`). Circle shared
  books split entries among chosen members; settle-up lines; others hear via chat + push and
  a `book_entry` feed post. Chat logging by rules (`moneyFastPath`, conversation step 1a′),
  strict: debts, plans and questions fall through. Month gift on the 1st, 10:00–13:00 local
  (client_id `gift:<month>`). Records only.
- Circle feed: post_reactions / post_comments. React, short comments (200 chars), delete own,
  and @Zaki (in a comment or POST /circles/:id/zaki): remind everyone (once per 3 h),
  ask check-ins, summary (extras), help. Zaki's comments store an event key
  (`zaki:<kind>|data`) rendered per reader by `zakiCommentLine`; no AI call. Not a group chat.

## Milestones (PRD §8)
- [x] M1 Skeleton: monorepo, Expo placeholder screens, Fastify /health, Prisma schema, shared zod types, vitest
- [x] M2 Capture and local storage: chat UI, SQLite, outbox sync, POST/GET /messages
- [x] M3 Conversation and memory: persona, pipeline, Saved chip fixes, evals (101 cases; extraction ≥98%, native review of evals/out/review.csv still pending). Reply streaming deferred.
- [x] M4 Notifications: local reminders + quick replies, push registration, pg-boss proactive messages with auto-slowdown
- [x] M5 Auth, sync and screens: Supabase sign-in (email link, phone OTP, Apple, Google), account linking + full sync, Upcoming/Money/Settings/Memories, export, delete. Home-screen widget (P1) deferred: expo-widgets needs the bundle ID and a dev build.
- [x] M6 Paywall: RevenueCat purchase/restore, webhook + refresh, chat lock (data readable), trial-ending notice
- [x] M7 Hardening: Sentry, rate limits + daily cap, retries, admin dashboard with AI cost per user, EAS profiles, Dockerfile. Store submission steps are manual (see README launch checklist).
