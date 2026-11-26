# Zaki (formerly Fakkarni) — AI friend that remembers, reminds, and helps with family and friends
Stack: Expo (React Native, expo-router), SQLite, Fastify, Prisma + Postgres (Supabase),
pg-boss, zod, RevenueCat, vitest. Monorepo: apps/mobile, apps/api, packages/shared.
Full product spec: docs/PRD.pdf (section numbers below refer to it).

Rules:
- Text input, plus on-device voice typing (owner decision, 2026-11-25): the mic writes words into
  the composer on the phone (whisper.cpp); audio is never saved, never sent, never processed on a
  server. Images only for receipts and homework pages (owner decision, 2026-11-23; see "Photos"
  below); no other image or audio processing.
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
  Every deploy needs the owner's yes. How: check the deploy branch out, `git merge --no-ff
  origin/main -F <message file>` (no workflow tag in the message), settle a conflict with main's
  side (`git checkout --theirs <file>`: the branch once carried a cherry-pick of #60), confirm
  `git diff --cached origin/main` prints nothing, run the tests, push; never force-push. Railway
  builds and switches over in under 5 minutes. Then start "Live API smoke test" by hand on main
  (it has `workflow_dispatch`): `/bootstrap 200` and the header `x-reply-stream: 1` say the new
  server answers, a 404 that the old one still does. Live by 2026-11-26 07:52Z: main at
  8f054e7 (through #64; the branch's tree equals main's).
  railway.json (#59, on the deploy branch only since that deploy) asks that traffic moves to a new
  deploy only after its /health answers, that the old one keeps serving 20 s more, then gets
  SIGTERM and 60 s to finish replies in flight. Deploys used to drop chat for a minute (messages
  sat on "Sending…"). Whether Railway reads the file for this service is not confirmed: see
  "Railway stops reading railway.json" below. The server itself did not hear SIGTERM until the
  Dockerfile started it with `exec node` (see "Kept database connections").
  It runs with REQUIRE_SUBSCRIPTION=0 and ALLOW_INSTALL_ID=1 until the stores and
  RevenueCat are set up; flip both before launch. `tsx` is a runtime dependency of the
  API because the container starts the server with it.
- Expo: project `@kiki91111/fakkarni` (projectId in apps/mobile/app.json). The build
  variables (EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SENTRY_DISABLE_AUTO_UPLOAD) live on EAS for
  the development, preview and production environments, not in the repo. Android test
  build: `npx eas-cli@latest build --profile preview --platform android` in apps/mobile.
  The cloud session can't reach expo.dev, so .github/workflows/android-build.yml starts that
  build from GitHub (secret EXPO_TOKEN) whenever the last commit of a push has a message containing
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
- Proactive messages (M4): pg-boss cron `proactive-tick-2` every minute
  (apps/api/src/jobs) → `planProactive` (pure; decides morning/night/check-in/
  follow-up from the clock, items and user state) → `writeProactive` (short AI prompt,
  template fallback) → stored as a friend Message + Expo push. The phone pulls them
  with GET /messages?after=. Set DISABLE_JOBS=1 to run an API without the scheduler.
- Tick scaling (2026-11-23): the tick does not loop over every user. users.next_tick_at (indexed)
  says when each user next needs a look (`nextTickAt`, proactive/schedule.ts, pure): every 10 min
  while awake, at wake time while asleep, at local midnight once the daily budget is spent.
  `runTick` claims due users in batches of 200 (UPDATE … FOR UPDATE SKIP LOCKED, a 3-minute lease),
  works 5 at a time, stops claiming after 45 s, and also pulls in anyone whose item remind_at /
  follow_up_at passed in the last 2 min. PATCH /me (time zone, waking hours, check-ins) and a time
  zone change in POST /messages clear next_tick_at. Any new proactive sender must fit this: a
  window of at least ~15 min while awake, or add its time to `nextTickAt`. The pg-boss queue
  "proactive-tick-2" is "exclusive" (no overlapping or piled-up ticks); photo cleanup and push
  receipts run in the "housekeeping" queue every 10 min. 3,000 users all due: one tick ~5.6 s locally.
- Push (2026-11-23): every server push goes through `trackPush` (proactive/push-receipts.ts):
  tokens Expo rejects are cleared at once, ticket ids are kept in push_tickets, and housekeeping
  reads the receipts 15 min later and clears DeviceNotRegistered tokens. Pushes use the Android
  channel "messages" (created by the app). The phone registers its token after the first
  message's permission ask, on every start (re-sent weekly or when it changes), after sign-in,
  and when the OS rotates it; sign-out calls DELETE /devices. Android push needs Firebase:
  google-services.json via the EAS file variable GOOGLE_SERVICES_JSON or apps/mobile/
  google-services.json (app.config.js), plus the FCM V1 service-account key on EAS, then a new build.
  F6 follow-ups are not pushed (the phone shows a local notification, as with reminders).
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
  cap); the phone shows a local notification at the same time, so the server does not
  push follow-ups.
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
- Chat first (owner decision, 2026-11-22; tab bar always shown since 2026-11-23): a new user
  sees Zaki's chat and the Me tab. The first version hid the bar and put Settings in the header:
  the owner read the missing bar as a broken build, and `router.push` to a tab with `href: null`
  does nothing. The bar and `Screen` pad by the bottom safe-area inset (Android is edge-to-edge;
  3-button navigation is 48dp and covered the composer). Since 2026-11-23 (owner decision) a tab
  never appears silently: Zaki introduces it in the chat (money talk: Daftar; family/friends
  words: People; third active day: Today) with an Open card, written on the phone by
  `addLocalFriendMessage` (never synced, client_id `local:intro:*`); the tab opens on the tap.
  "Open the Daftar" opens at once; "what can you do?" gets the overview with every card
  (src/lib/unlock.ts, pure + tested; state in prefs "unlocked" via src/lib/unlock-store.ts).
  An accepted invite or Daftar link opens its tab directly. No saved state = a user from before
  chat-first: everything stays open. Story: "Zaki remembers so you don't have to".
- Sign-in is required at onboarding (owner decision, 2026-11-23); only a build without sign-in
  configured shows "Start" without it.
- Growth plan (2026-11-23, doc https://claude.ai/artifact/G2Z59tkVagTUrDvsschK1R): beachhead user
  is a mom running a household; first chat shows household starters (`t.chat.starters`).
- Personal invite link: GET /me/referral returns `url` (…/r/CODE); the public page
  (apps/api/src/routes/referral-page.ts) shows the inviter's first name only. The app route
  /ref/[code] claims it (POST /referrals/claim), parked in prefs `pending_referral` until after
  onboarding. A typed code that is not a circle invite is tried as a personal code. Both sides
  get 7 Pro days (`REFERRAL_WELCOME_DAYS`, once per invitee; inviter capped at 28 a month).
  "Invite a friend" sits on the out-of-messages (upsell) bubble and in Me.
- Product analytics: the phone sends counted events (`APP_EVENTS` in
  packages/shared/src/analytics.ts; queue src/lib/analytics-queue.ts, screen views from the root
  layout) to POST /events, stored as Event "app:<name>". Every chat turn writes a `chat_intent`
  event (item types, memories, card kinds, reply kind; never words). /admin shows weekly active
  circles (north star), invite counts and the event table. Add a name to APP_EVENTS to track
  something new; never put text, names or amounts in props.
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
- Chat actions (owner ask, 2026-11-22: "the chat must add to Daftar, circles and trackers"): the
  model returns `app_actions` (packages/shared/src/chat-actions.ts: log_money, create_section,
  set_budget, create_tracker, log_tracker, update_tracker, create_circle, assign_task, ask_circle;
  max 3). It names things and the server resolves the names (`matchByName` / `foldName` in
  apps/api/src/chat/cards.ts) against the "IN THE APP" block of the context. apps/api/src/chat/actions.ts
  runs them after apply, never on a crisis turn, and stores cards on the reply
  (messages.actions_json; wire `Message.actions`: id/kind/status/label/route). The user's own things
  happen at once; anything that reaches other people (assign_task, ask_circle, logging into a shared
  book, also from the money fast path) is a pending card holding resolved ids in a server-only
  `payload`, confirmed by tapping (POST /messages/:id/actions/:actionId {confirm}) or by a plain chat
  yes/no (`isConfirm` / `isCancel`, conversation step 0a, within 6 h). The answer reply carries the
  same card id so the phone updates the old card (apps/mobile/src/db/messages.ts). Card wording lives
  in `LABEL` (cards.ts), never model text. Phone: SQLite v4 `actions_json`, src/chat/ActionCards.tsx.
- Structured output limits: the API answers 400 "Schema is too complex" to every request whose
  output schema has more than 16 union-typed (nullable) or 24 optional parameters, counted across
  the whole schema. PR #33 crossed it (29 nullable fields) and every chat turn fell back to "my
  brain froze". `ModelOutput` keeps app actions non-nullable ("", 0, [], false = not given;
  `toAppActions`), and src/ai/model.test.ts fails the build past the limits. Check it whenever a
  field is added to the model schema.
- Understanding: persona 2026-11-23.1 adds "Understanding the user" (typos, short replies, two
  readings) and the app_actions rules with examples. evals/cases/understanding.jsonl (act-*, und-*)
  checks app actions too (`expect.actions`; extra actions count as a problem). Not yet measured
  with a model key.

- Split the bill (2026-11-23; NOT named E7sebly, which is a real Egyptian app): table splits,
  math in packages/shared/src/split.ts (pure: items split among their eaters, none = everyone;
  the rest of a typed bill shared by all; service 12% and VAT 14% in proportion; largest-remainder
  rounding). Routes apps/api/src/routes/splits.ts; public page GET /s/:code where friends without
  Zaki add their own items (POST form, `web_adds`) and see an install call to action. Phone:
  app/split/new.tsx, app/split/[id].tsx, the "Split" chip in the money tab; chat "قسّم الحساب"
  offers a card (unlock-store). Records only.
- Homework hand-in: circle_tasks.submission / submitted_at / review / review_note. The child hands
  in text or a link (POST /tasks/:id/submit; says yes to a pending task and finishes it); the parent
  is told in chat + push and answers Well done or Redo (POST /tasks/:id/review; redo reopens it).
- Zaki streak (phone only, apps/mobile/src/lib/streak.ts pure + streak-store.ts, prefs "streak"):
  days in a row with a user message; one missed day per 7 is forgiven; flame pill in the chat header
  from day 2; a local Zaki line at 3/7/14/30/60/100 days (client_id `local:streak:*`). Nothing is
  ever sent when a streak ends (no guilt).
- Friday check-up (apps/api/src/proactive/checkup.ts pure, `sendFridayCheckup` in tick.ts): Friday
  11:00-14:00 local, once (client_id `checkup:<day>`, kind "checkin", pushed): done this week,
  tracker days, overdue (offered "finish or move?"), next week, open debts, then one question.
  Skipped when there is nothing to say. Template words, no AI call.
- Invite page peek: GET /i/:code also shows members' first names (6, then "+N") and the count of
  open circle tasks. Nothing else about the circle is public.
- Notification budget: Zaki's own messages (proactive:, status:, checkup:, gift:, memory:; a
  multi-bubble send counts once) stop at DAILY_ZAKI_BUDGET = 5 a local day (`zakiSentToday`,
  proactive/tick.ts). Reminders the user asked for are never counted.
- Memory moments (proactive/memory-moment.ts): about once a week, 16:00-19:00 local, one short AI
  call brings back a memory 14-120 days old (not used in 14 days, never "place" or sensitive by
  keyword; the model may answer SKIP). No template fallback. Stored as kind "checkin", client_id
  `memory:<id>:<iso>:<n>`, event `memory_moment` (once per 7 days, sent or not).
- Share cards: apps/api/src/cards/render.ts draws SVG and turns it into PNG with @resvg/resvg-js
  (fonts in apps/api/assets/fonts, OFL; the font has no emoji so `noEmoji` strips them). Public
  routes GET /cards/streak/<days>.png?code= and /s/:code/card.png (also the split page og:image).
  The phone downloads and shares them (src/share/card.ts, expo-file-system + expo-sharing, both
  already in builds): tap the streak flame, or "Share as a picture" on a split.
- Split to Daftar: "Put what's left in the Daftar" on a split creates Daftar entries from the
  creator's side (`daftarFromSplit`, mobile split/logic.ts; the creator is the first person).
- Photos (owner decision, 2026-11-23, the only exception to text-only): limits in
  packages/shared/src/photos.ts. Receipts: POST /receipts/read (apps/api/src/routes/photos.ts)
  sends the photo to `readReceipt` (src/ai/model.ts, RECEIPT_SYSTEM, non-nullable schema) once,
  never stores it, and counts as one chat AI message (`ai_call` purpose "chat", photo "receipt").
  Phone: app/receipt.tsx logs the total into a Daftar section with a tap, or fills the split form
  (`draftFromReceipt`, handed over in memory by split/handoff.ts). Homework: up to 5 page photos
  with POST /tasks/:id/submit, stored in table photos (bytea) for the child and the assigner only
  (GET /photos/:id checks), deleted by the proactive tick after PHOTO_KEEP_DAYS (90); in
  /me/export. The picker is optional native code (expo-image-picker + expo-image-manipulator,
  src/lib/photos.ts `photosAvailable`): photo buttons appear only in builds made after
  2026-11-23. Shrunk to 1600px JPEG on the phone. Do not add any other photo use.

- The whole app from chat (2026-11-23, owner ask "Zaki does everything in the app by talking"):
  - One AI call per turn, as tool calls (apps/api/src/ai/tools.ts): `respond` (strict: reply, items,
    memories, crisis; 13 nullable fields, guarded by tools.test.ts) plus non-strict area tools (money,
    daftar, tracker, circle, task, split, app), each validated with zod into an AppAction. Tool results
    are never sent back. No usable `respond` or a 400 → the old structured output (`ModelOutput`,
    flat app_actions). FAKKARNI_CHAT_TOOLS=0 turns tools off.
  - New action kinds run in apps/api/src/chat/more-actions.ts. The user's own changes happen at once
    and carry a server-only `undo` payload (wire `undoable`; POST /messages/:id/actions/:aid {undo:true},
    apps/api/src/chat/undo.ts, 24 h). Anything another person sees is a pending card.
  - Context carries the numbers (`loadAppNumbers` → `describeNumbers`): month spend per section,
    Daftar from the user's side, tasks with ids (asked of / by the user, homework to review), splits.
  - News from other people is a chat line (`postUpdate`, kind "update") that can carry cards
    (`activityCard`): a task request (Yes accepts / No declines), handed-in homework (Yes = well done /
    No = redo), a Daftar entry from a circle member (right / not right). `noPayload` makes "no" an
    answer instead of a cancel, by tap or plain chat yes/no. Joins, check-ins, RSVPs and split web adds
    also write a line (apps/api/src/circles/ops.ts).
  - Rule shortcuts (no AI): "تراجع"/"undo" undoes the latest undoable card (`isUndo`); "وصلت البيت"/"I'm
    home" offers a check-in card (`homeCheckin`); a debt item with a circle member gets an "add to the
    shared Daftar?" card (`debtCards`).
  - User.gender ("female"/"male", PATCH /me, onboarding in Arabic, Settings, chat setting "address")
    decides ADDRESS THE USER AS before the old memory rule; while unset the context asks Zaki to ask once.
  - Item.alarm: only when the user asks or says yes; the phone schedules it on the "alarms" channel
    (MAX importance, bypassDnd, iOS timeSensitive; SQLite v5). A full-screen alarm needs a new native build.

- Saved copies and lenient lists (2026-11-23): server-only screens (circles list, a circle with its
  feed and trackers, Daftar, money, sections, tasks, trackers, splits) read through `cachedGet` in
  apps/mobile/src/lib/api.ts, which keeps the last good reply (src/lib/screen-cache.ts, localStorage,
  wiped by db/reset.ts); screens start from `peek*()` and refresh behind. Lists parse entry by entry
  (`eachValid`): one row that doesn't fit is dropped instead of failing the whole screen. The circle
  screen loads detail, feed, trackers and summary independently. Add new server-only screens the same way.
- End-to-end smoke test: apps/mobile/src/e2e/api.e2e.test.ts runs the phone's own API client against
  a live API as two people (every shared feature). Skipped unless E2E_API_URL is set; how to run is in
  the file. Run it after any change to a wire shape.
- Over-the-air updates from the cloud: .github/workflows/ota-update.yml publishes to the "preview"
  branch (Android test builds) when a pushed commit message contains "[ota-update]". Use it for
  JavaScript-only fixes; EAS's free plan Android builds run out monthly. Since 2026-11-24 it also
  publishes the iPhone copy (branch "expo-go", Expo Go): before that, iPhone fixes needed a manual
  publish and the owner's iPhone ran an old bundle for a day of fixes.
- Alarms: `wantsAlarm` (pipeline/rules.ts) hears "منبه / صحيني / alarm / mnabeh" and the pipeline
  sets alarm on what the turn creates or changes (the model sometimes said "set" with alarm false);
  "بلاش منبه" turns it off. Me has an Alarms list (local SQLite `listAlarms`) with Remove; the Saved
  screen turns an alarm on or off (PATCH /items {alarm}). Me starts from the cached profile
  (`peekMe`) and every change shows at once (rolled back if the save fails).
- Lost replies: POST /messages keeps an in-memory set of messages being answered. A retried
  client_id with no stored reply that isn't in the set (the server restarted mid-reply, e.g. a deploy)
  is answered again; one still in the set gets 409 so the phone retries. The phone waits 60 s for a
  reply (REPLY_TIMEOUT_MS), retries at most a minute apart, and labels pending messages "Sending…".
  Deploys restart the server: a reply in progress at that moment used to be lost for good.
- Task dates: the new-task screen and "Change reminder time" offer a calendar and clock
  (src/ui/DateTimePicker.tsx, pure JS on purpose so it reaches builds over the air; logic in
  src/lib/calendar.ts) besides the quick picks.
- Live server check: the cloud session can't reach the Railway URL. .github/workflows/api-smoke.yml
  (a pushed commit message containing "[api-smoke]", or started by hand: it has `workflow_dispatch`,
  which is the way after a deploy because nothing needs pushing) times the screens' GETs and runs
  the e2e test against production, with this commit's phone client and with the client of the
  installed build. The log of a running job cannot be read; it is there when the job ends (~3 min).
  Its last two streamed chat turns come after a quiet pause (35 s; started by hand, the `quiet`
  input sets the seconds, up to 280): they show what a message costs after the server sat idle
  (see "Kept database connections").
- Rate limit: 600 requests a minute per caller (120 refused whole screens while chat, which has its
  own 30/min bucket, kept working). 429s are logged as "rate_limited". The phone shows busy / server /
  sign-in text from `failText` (src/lib/errors.ts) instead of always "no connection".
- Auth writes users.last_active_at at most every 5 minutes (it was a row write on every request).
- Speed (2026-11-24, measured from the smoke test): one database round trip from the API is ~0.1 s
  (the Railway server and Supabase eu-west-1 are far apart), so time goes to sequential queries,
  not the AI call (~1.5-2.5 s). A chat turn used ~25 sequential queries. The pipeline now loads
  the context while the rule checks run, runs independent lookups together, writes replies in one
  statement (no transaction when the turn only replies) and the cost event alongside. Keep new
  queries in the chat path parallel; `api-smoke.yml` times a chat turn and one round trip.
- Reminder truth (2026-11-24): a reply that says a reminder/alarm is set (`promisesReminder`)
  while the turn sets no time (`setsReminder`) gets one model retry with a CHECK note; then an
  item set in the last 2 h is shown under the message, else Zaki says it isn't set yet. The
  context always includes the 10 most recently changed open items (MAX_OPEN_ITEMS cut them off).
  Today shows repeating reminders in their own list so they can't hide new plans.
- Preloading (2026-11-24): `prefetchAll` (apps/mobile/src/lib/prefetch.ts, throttle in
  prefetch-plan.ts) loads every server-only screen (me, circles + each circle's detail/feed/
  trackers, tasks, trackers, Daftar, money, splits, memories) through `cachedGet` on app start,
  on resume and back online (sync/index.ts `refresh`), at most once a minute, so tabs open from a
  fresh saved copy. Add any new cached screen to it. Tracker logs show at once (`bumpTracker`).
- Onboarding and every app start send the phone's language to the server (it stayed Arabic for
  English users, so proactive lines, circle posts and pushes came in Arabic).

- Phone brain (Android test mode, owner ask 2026-11-25: "fully local to test, keep cloud Zaki"):
  Zaki's model can run on the phone (llama.rn, llama.cpp). Settings › "Zaki's brain (test)" picks
  Cloud or On my phone and downloads the model once (src/brain/catalog.ts: Qwen3.5 0.8B Q4 first on
  every phone, 2B a choice; files in the app's documents folder). Phone eval 2026-11-25 (reply
  grammar forbids the wrong script, `cleanPhoneReply` drops Modern Standard / leaked JSON / looping
  bubbles): 0.8B style 91.8% cases, 98.6% holdout3, 3.3 s; 2B 92.4% / 100%, 5.9 s (runner CPU). Protocol: POST
  /messages with `brain: "phone"` → rules may answer at once (201); otherwise 202 `needs_brain`
  {system, context, history} (persona/phone.ts, `renderPhoneContext`, last 6 messages) → the phone
  writes the compact PhoneOutput JSON under a JSON-schema grammar (packages/shared/src/phone-brain.ts)
  → POST again with `phone_output` → apps/api/src/ai/phone.ts turns it into a FriendResponse and the
  normal pipeline applies it (crisis net, reminder honesty, cards, undo). No allowance used, `ai_call`
  purpose "phone" with no cost, no cloud summary. If the phone model fails, cloud Zaki answers unless
  the user turned the fallback off (src/brain/flow.ts, pure + tested). The phone persona copies the
  WELLBEING section from the main persona word for word (phone.test.ts checks it). Known gap: a
  tracker step that answers an open reminder is logged on both passes. Offline replies are not done:
  the message still waits for the network, because the context comes from the server.
- Code decides, the model chats (owner decision, 2026-11-25: "AI is for chatting only, the tasks are
  math"). In phone mode the rule engine (packages/shared/src/understand, pure: dates, times, amounts,
  names, intents in Arabic, Franco and English) decides every action on the server
  (pipeline/understand-input.ts → `understand`); the 202 hands the phone a reply-only prompt
  (persona/phone-reply.ts, WELLBEING copied word for word), a DONE / ASK summary and a {reply, crisis}
  schema. The second pass ignores everything else the model wrote. A failed or over-promising reply
  is replaced by `templateReply`. Missing time / amount / person → `ask`, nothing saved. Optional hidden
  "clear form" rewrite by the small model (understand/clarify.ts) is used only when the code found
  nothing. Score with `npm run eval -- --brain rules --set <cases|holdout|holdout2|holdout3>`; each
  holdout set was committed before the engine ran on it (unseen scores 88.8%, 89.3%, 80.3% messy; all
  ~100% after fixes). Write a NEW set before claiming accuracy on unseen wording. The rewrite is scored
  by .github/workflows/clarify-eval.yml ("[clarify-eval]").
- Phone mode answers in code first (2026-11-25, kareem's Pixel 8: messages sat on "Sending…" and
  got "I'm here 💛 Tell me more?"): a turn the rule engine fully decides (something saved, changed or
  asked) gets `templateReply` at once (201, no 202 and no on-phone model; that took 20-40 s), and
  questions about the user's own data ("what do I have this week?", "sagelt kam?", "who owes me?",
  "shrbt kam?") are answered from the context by apps/api/src/pipeline/questions.ts (pure). Only
  small talk reaches the phone's model, which now runs the same `cleanPhoneReply` check (moved to
  packages/shared/src/phone-brain.ts; the 202 carries `lang`) and stops after 10 s (`THINK_LIMIT_MS`):
  either way cloud Zaki answers unless the fallback is off. Franco with no digits ("sagelt kam",
  "shrbt maya ahh") counts as Franco, "shrbt maya" logs water, and "ahh"/"aywa" answer a check-in.
- Phone model evals: `npm run eval -- --brain phone --base-url <llama-server> --label <name>` scores a
  GGUF model served by llama.cpp with the phone prompt and grammar. The cloud session can't download
  models, so .github/workflows/phone-model-eval.yml runs the candidates on GitHub ("[phone-eval]").
- Voice typing: whisper.rn + modules/zaki-mic (a tiny local Expo module: 16 kHz PCM in memory, 60 s
  max). Mic button in ChatInput; model download in Settings or on first tap (Whisper small q5, base on
  phones under 3 GB). All of it is optional native code (src/brain/native.ts): builds before
  2026-11-25 never show it. Android only.
- Local-first shared writes (2026-11-25): tracker steps and check-ins tapped offline are kept on the
  phone (src/sync/writes.ts, localStorage "pending_writes", pure + tested) and replayed oldest-first
  on every refresh with an x-idempotency-key; the server answers a replayed key from memory
  (apps/api/src/plugins/idempotency.ts, per install id, 1 day) so nothing is applied twice. The screen
  keeps its guess (`QueuedOffline`). Tracker logs carry `at` (≤3 days back) so streaks count the tap's
  day. Route more writes through `writeOrQueue` (api.ts) when their screen can show a guess.
- Live screens (2026-11-25, kareem: "nothing updates until I close and reopen"): screens load with
  `useLive` (apps/mobile/src/lib/live.ts) instead of useFocusEffect: on focus, whenever `dataChanged`
  fires (a chat reply arrived, pulled messages, a card tap, offline taps sent), and every 30 s while in
  view with the app in front. The app also pulls Zaki's messages every 30 s while open (push isn't on
  every build), and `prefetchSoon` refreshes every saved copy after a change. Use `useLive` for any
  new server screen (not for forms: Settings and new-split keep useFocusEffect).
- Loading and the Daftar (2026-11-25, kareem: "too much loading", Daftar sections failing): `Screen`
  owns its pull-to-refresh spinner (shown only for a pull, at most 1.5 s, remounted after each pull
  because Android left the circle stuck); never pass `refreshing`. `useLive` runs one load at a time.
  Money is local-first: sections and amounts get their id on the phone (`CreateSectionRequest.id`,
  `AddMoneyEntryRequest.id`; the server returns the existing row for a known id), writes in flight or
  waiting in the outbox are laid over the saved copy (`overlayOverview` / `overlayDetail`,
  money/logic.ts), and answered writes go into the saved copy (money/actions.ts). The section screen
  opens from the list's row while its entries load. Twin sections ("salary" / "Salary", `sectionKey`)
  are refused and old twins merged into the oldest on GET /money (`mergeDuplicateSections`). Money
  routes answer 422 (not 409) for writes that will never pass, because the phone resends 409s. GET
  /money reads every section's month in one query (`toWireSections`). DB pools: API 8
  (DB_POOL_MAX), pg-boss 3 (PGBOSS_POOL_MAX): Supabase's session pooler allows ~15 in all
  (what the API's pool does when that is used up: "Kept database connections").
- OTA fixes apply without a restart: src/lib/updates.ts checks on start and on return (at most every
  10 min), downloads in the background and reloads when the user leaves the app.
- Model downloads (brain/files.ts, rules in brain/segments.ts): 32 MB HTTP Range pieces appended to
  "<id>.part", each retried with growing waits; a stopped download keeps its bytes ("paused"),
  resumes by itself when the network returns or the app comes back to the front, and the button says
  Resume. A failed piece is retried once a minute for ~30 min before pausing (cell-tower switches fire
  no network event).
- Chat reliability (2026-11-25, kareem's real-phone test: most plain messages got "دماغي هنجت"):
  the model's history now always ends with the message being answered (`historyUpTo`; a history
  ending in Zaki's turn is a prefill, which the API refuses), `buildMessages` drops blank turns and
  broken emoji halves, and a refused or unparsable call is retried once with only the current
  message. Every failure writes an `ai_error` event {status, kind, attempt} (never text); recoveries
  write `ai_recovered`. The Anthropic client waits 25 s with one retry so a reply lands inside the
  phone's 60 s wait. When every app action of a turn fails, the reply is the cards' own words
  (`honestReply`), never the model's "I'll do it". daftar_cancel / daftar_settle with no Daftar entry
  close a matching open debt item (undo `item_status`). Tracker asks wait 10 min after the user's
  last message.
- Reply speed (2026-11-25, kareem: "Zaki is super slow"): the reply comes back in the POST itself.
  A retry of a message still being answered now waits for that same answer (`inFlight` map in
  routes/messages.ts) instead of 409 + up to a minute of phone backoff. Background screen loads
  (`prefetchAll`) go 2 at a time, pause while a chat message is being sent (`setChatBusy`) and start
  4 s after a reply: the phone sends ~5 requests per host at once, so 20 loads right after a reply
  made the next message queue behind them. Every turn reports `Server-Timing` (rules, context,
  model, saved, total) and writes a `chat_timing` event; the phone sends `app:chat_reply`
  {total, think, brain}; /admin shows median / p90 per source and model failures by kind; Settings ›
  Zaki's brain shows the last reply wait. Live baseline 2026-11-25 (fresh account, US runner): rules
  turn 1.0 s, AI turns 3.0–3.5 s.
- Android builds without the EAS quota: .github/workflows/android-local-build.yml runs `eas build
  --local` on a GitHub runner (arm64 only) when a commit message contains "[android-local-build]",
  and attaches the APK to a GitHub pre-release.

- Speed pass (2026-11-25, kareem: "super super super slow", target 10 times faster). The wait was
  database round trips in a row (~0.1 s each while the API is in the US and Supabase in eu-west-1),
  one request per tab, and the phone waiting for the server before it drew a tap; the model is only
  part of a chat turn. Measure before and after any speed change:
  `npm run perf -w @fakkarni/evals -- --label <name> [--rtt 100] [--only <group>]` (evals/perf/run.ts)
  runs the real app in-process against a local Postgres through a delay proxy with a stand-in model,
  prints time and round trips per screen, tap and chat turn, and writes evals/perf/out/<label>.json
  (not committed); `--compare a,b` puts two runs side by side. It empties every table, so
  PERF_DATABASE_URL must name a database with "perf" in it (default fakkarni_perf; migrate it first).
  At 0.1 s a trip, before → after: every tab refreshed 3.7 s / 103 trips → 0.9 s / 46 in one request;
  taps 0.6–2.1 s → 0.4–1.2 s; a chat turn besides the model 0.9–1.8 s → 0.5–1.3 s. At 0.02 s a trip
  (the API in the database's region) the same code gives 0.2 s, 0.09–0.26 s and 0.11–0.29 s: the
  region move is worth more than any code change, and it is a Railway dashboard setting.
  Live after the deploy of 2026-11-26 (smoke test, a fresh account, a US runner, the API still in
  US East; the run before the deploy → the run after): every tab's data, nine GETs adding up to
  4.1 s → one GET /bootstrap of 0.30 s (0.76 s the first time after the restart; the nine GETs one
  by one now add up to 2.7 s); one tab's GET 0.28–0.78 s → 0.20–0.30 s; sign-in plus one query
  0.27–0.38 s → 0.19–0.22 s (the runner's own trip to Railway was 0.08 s of the first and
  0.11–0.13 s of the second, so one database round trip is still ~0.09 s); a turn the rules
  answer 0.88 s → 0.57 s; an AI turn 2.3–5.0 s → 2.7–3.5 s (the model: `rules` and `context` end
  at 0.27–0.30 s in the turn's timing). An account with circles has more in its /bootstrap than
  the fresh one measured here.
- Server speed rules (same pass):
  - Count round trips, not queries: run independent lookups together, and never add a query in a
    row to a hot path (auth, GET of a tab, POST /messages) without measuring it.
  - Prisma `relationJoins` (preview feature in schema.prisma): an `include` / nested `select` is one
    joined query instead of one per relation. No code sets `relationLoadStrategy`.
  - Sign-in lookup (plugins/auth.ts): the caller's user row is reused for USER_CACHE_MS (15 s; "0"
    turns it off) on GET and HEAD only. Every write looks the row up and drops the caller's copy
    when it is answered; a route that changes someone else's user row calls `forgetCachedUserId`
    (plan webhook, invite reward, referral code) once the change is committed, never inside its
    transaction (a read in between would save the old row again). A read that was still looking
    the row up when it was dropped does not save what it found. So a GET handler must not trust
    `req.user` for a decision that writes (see `ensureCode`), and must never change the object.
    Kept in the process: with more than one API instance, another instance's write shows up to
    15 s late. Off unless buildApp gets `userCacheMs` (server.ts passes it; tests change rows
    behind the API).
  - `inBackground` (src/lib/background.ts): rows nobody reads in the answer (events for /admin)
    are started and not awaited. Never for allowance counts, safety flags or anything a later
    request reads.
  - GET /bootstrap (routes/bootstrap.ts) answers every tab's GET in one request: it calls the
    app's own routes as the caller (`app.inject`, a per-process header keeps them out of the rate
    limit) and returns `{v: 1, parts: {"<path>": "<that route's JSON text>"}}` with an ETag (304
    when nothing changed; the queries still run, only the bytes are saved). One call runs up to
    32 GETs inside, so the route has its own limit, BOOTSTRAP_PER_MINUTE (30 per caller); the
    phone treats a 429 there like being offline and does not fall back to one request per tab.
    A new server-only screen goes into BOOTSTRAP_BASE or BOOTSTRAP_CIRCLE, the phone's `PARSERS`
    (lib/api.ts) and `prefetchAll`.
  - plugins/gzip.ts gzips text answers of 1.4 KB and more when the caller accepts it (the phone's
    HTTP client does). Register it after any onSend hook that reads the answer as text.
- Phone speed rules (same pass). The rule: nothing the user does waits for the server to be drawn.
  - Saved copies live in memory (src/lib/screen-cache.ts: parsed once, the same object back while
    the text is unchanged, written to storage a moment later and when the app is left). Reads go
    through `createSavedReads` (src/lib/saved-reads.ts, pure + tested): one request per path at a
    time, a copy confirmed in the last 8 s is used as it is, any write or `dataChanged` ends that
    freshness, and an older answer never replaces a newer one. `refreshAll` (lib/api.ts) brings
    every tab with GET /bootstrap and fires `cacheRefreshed` (src/lib/signals.ts), which makes the
    screens in view re-read from memory; a server without the route (404) gets the old one-by-one
    preload for 30 minutes before it is asked again. Wiping the phone (`resetLocalData`, after the
    account is deleted) calls `forgetSaved()`: an answer still on its way for the last person is
    never kept, and a write answered after the wipe is not handed on (`person` in `request`).
  - A screen's `load` reads its `peek*()` first, then asks. A write's answer goes into every saved
    copy that shows it (`reads.set` through `saved` / `savedIn` and the `saved*` helpers in
    lib/api.ts), so another tab has it before its next read. A write answered with no body (an
    RSVP, a deleted comment) changes the saved copy itself, or the next `load` draws the old state
    for a moment. Do the same for any new write.
  - Taps: `useGuess` (src/lib/optimistic.ts; logic in guess-row.ts, pure + tested) with a pure
    `guess*` helper per feature (tasks, daftar, circles, trackers `bumpTracker`). The guess shows in
    the same frame, sends go out in tap order, only the last answer of a row is drawn, a failure
    falls back to the newest confirmed state, and `keep` holds a guess queued offline
    (`QueuedOffline`). Honesty stays: anything that reaches other people (Yes / Send on a chat
    card, "sent to the circle" toasts) shows as done only after the server says so; the user's own
    Cancel, Undo, done, reaction, comment, check-in and tracker step show at once.
  - Chat: a sent message is drawn before it is stored (`draftUserMessage` → `saveUserMessage`,
    chat/useChat.ts) and stays until the store hands it back; `keepSame` (chat/list.ts) keeps
    unchanged bubbles' objects so only what changed redraws. Marking a plan done is local first
    (lib/useItems.ts): the row leaves at once, SQLite is updated with the same `updated_at`, the
    server follows through `writeOrQueue`.
  - Checking the app in a browser without a server: build `node scripts/build-web-preview.mjs
    out.html`, then load it in Playwright with `page.route("https://zaki.preview/**", (r) =>
    r.fulfill({ contentType: "text/html", body }))` and open https://zaki.preview/ (a file:// page
    cannot route, and plain http has no `crypto.randomUUID`).
- Railway stops reading railway.json (config as code, deprecated) on 2026-12-01
  (docs.railway.com/config-as-code): files "continue to work for services that already use them"
  until then, and "new services cannot opt into" it. Ours first had the file on its deploy branch
  with the deploy of 2026-11-26, so it may not be read at all (a deployment's details page marks
  the settings that came from a file; not looked at). Either way the health check path (/health),
  the 20 s overlap and the 60 s drain from #59 belong in the service's Settings in the dashboard
  (the last two also as the service variables RAILWAY_DEPLOYMENT_OVERLAP_SECONDS and
  RAILWAY_DEPLOYMENT_DRAINING_SECONDS), where the region is set too: EU West (Amsterdam,
  `europe-west4-drams3a`), beside the database, and a service without a volume moves with no
  downtime. The owner was asked for both on 2026-11-26. The region has moved when the smoke
  test's `/splits` time minus its `/health` time (one database round trip, ~0.09 s on that day)
  falls to about 0.02 s, and when its `x-railway-upstream-zone` line (the zone the server runs
  in, which Railway adds because the test sends `x-railway-debug`) no longer says
  `railway/us-east4-eqdc4a`. The `x-railway-edge` line only names the edge nearest the runner
  (iad1 and lax1 on that day's two runs). During an overlap two servers run: the DB pools are
  sized for one (8 + 3 of the session pooler's ~15), so the new server waits its turn on the
  few connections it gets until the old one is gone ("Kept database connections").
- Replies that show while they are written (2026-11-26, same speed thread). Only how soon the
  words show changes: the stored answer and everything a turn decides are as before.
  - Wire: the phone POSTs /messages with `Accept: text/event-stream, application/json`
    (apps/mobile/src/sync/stream.ts). When the model writes the reply the server answers with
    events: `draft {i, d}` (more words of bubble i), `reset {}` (forget the draft, the reply is
    being written again), then `done {status, body, timing}` (exactly the plain answer) or
    `error {status}`. The stream opens with its first words (routes/live-reply.ts), so a turn
    the rules answer, a failure before any words, a resend, a retry that joins a turn in flight,
    phone-brain mode and a phone that did not ask all get the plain JSON answer as before.
  - The switch that needs no app update: a server that streams says so on every answer
    (`x-reply-stream: 1`, REPLY_STREAM_HEADER; app.ts `liveReplies`, true while the model's
    `streams` is), and the phone asks for a stream only from a server that says so (it keeps
    what the server last said in localStorage `pref:reply_stream`). FAKKARNI_CHAT_STREAM=0 on
    Railway takes the line away, and every phone is back on the plain POST with its next
    answer. A server from before streams never says it, so an app update alone changes nothing.
  - Model: `respond(input, live)` asks for the same tool turn as a stream (ai/respond-stream.ts;
    ai/reply-stream.ts picks the reply's words out of the `respond` tool's JSON as it arrives).
    `eager_input_streaming` goes on `respond` on streamed requests only. FAKKARNI_CHAT_STREAM: "0"
    never streams, "plain" streams without the eager flag. A 400 on a streamed request that then
    passes without the stream steps the mode down for the life of the process (eager → plain →
    off); two streams in a row that break or pass 25 s pause streaming for 10 minutes. Whether
    the API takes the eager flag on a strict tool was not checked with a real key before this
    shipped. It does, live since the deploy of 2026-11-26: the smoke test's streamed small-talk
    turns showed their words in 12 to 20 `draft` events, none taken back, and the parts reached
    the runner spread over 0.6–0.7 s of the model's writing (the test prints when each part
    arrived; a reply read without the eager flag arrives bunched). First words at 1.5–2.4 s, the
    whole answer at 2.3–3.9 s (`first` 1.1–2.0 s in the turn's timing). The turn that sets a
    reminder came whole, as it does when the reply opens by saying it is set, and the e2e walk
    read a stream to its end. /admin, "How replies were read from the model" (the `stream` and
    `stream_lost` props on `ai_call` events: eager / plain / whole, and refused / timeout / cut
    for a streamed try that was lost and read whole instead) and "first words" show the same
    for every turn.
  - Cost of a lost stream: it is paid for as far as it got. What it read is known from its
    start and added to the turn's usage; what it had written is only told at a stream's end,
    so the turn's cost is a floor. The eager flag changes the tools, which come before the
    cached persona prompt, so eager turns and whole turns keep separate cache entries: a turn
    that falls back to a whole request writes the cache again unless a whole turn ran in the
    last 5 minutes. Compare cache_read and cache_creation tokens on `ai_call` after a deploy;
    FAKKARNI_CHAT_STREAM=plain puts both kinds on one entry (the reply then arrives in one
    piece, still ahead of the rest of the turn).
  - What may be shown (pipeline/draft.ts, pure): whole words, three words behind the writing;
    nothing from a sentence that says a reminder or alarm is set (`saysReminderSet`), or after
    it, until the turn is done (step 3c decides whether it is true); when the reply must be
    Arabic, a bubble only once it has an Arabic letter, and nothing more once one ended without;
    bubbles past the third fold into it. Nothing at all on a message the crisis keyword net
    caught: that reply goes out whole with the helpline, as always. Any rewrite sends `reset`
    first, also when the server replaces the reply with its own words (`honestReply`): call
    `live?.onRestart()` before any new step that changes a reply after the model wrote it.
  - `reply.hijack()` takes the answer away from Fastify: its onSend hooks do not run (no gzip,
    which a stream needs; live-reply drops the caller's saved user row itself) and an error in
    the handler would only be logged, so the route catches it and ends the stream with `error`.
    A failed streamed turn sets the raw status, so the error count and request log say 500.
  - Phone: React Native's `fetch` hands a body over only when it is complete, so the reply is
    read with XMLHttpRequest (sync/opener.ts: handlers set before `send`, text read on
    readystatechange / progress, never at DONE because RN puts an error's words in responseText).
    The draft is memory only (chat/writing.ts, `replyWriting` in sync/index.ts): rows named like
    the stored reply (`<client_id>:reply:<n>`), so the stored bubbles take their place without a
    jump; dots under the last bubble; the message being answered stops saying "Sending…".
    When a streamed send ends with no answer (cut after it began, or nothing at all), the same
    message goes out again at once the plain way (`sendForReply`; the server answers it from the
    turn in flight or from what it stored): a phone whose stream reading fails is answered as it
    always was. An answer that was read is kept however the connection ends after it. Streaming
    goes off on that phone for 10 minutes after two failed streams in a row with none read to
    its end in between (`createStreamSwitch`): a cut counts at once, a send with no answer at
    all only when the plain send after it is answered, and one that waited out the whole 60 s
    counts double. One lost connection changes nothing. None of this was run on a real phone
    before it shipped (the opener was run on a browser's XMLHttpRequest).
  - Tests: apps/api/test/anthropic-standin.ts is a stand-in Messages API on a real socket, so
    model-stream.test.ts and messages-live.test.ts run the SDK's own stream code. The e2e test
    sends one streamed message; E2E_EXPECT_WORDS=1 makes it require the words (against a local
    API started with ANTHROPIC_API_KEY and FAKKARNI_ANTHROPIC_BASE_URL pointing at the stand-in,
    or a real key). api-smoke.yml prints "first byte" for streamed turns. The browser preview has
    no server: it replays its sample answers word by word (apps/mobile/src/demo/replay.ts).
  - The real app in a browser against a local API (the nearest thing to a phone a cloud
    session has; run 2026-11-26 with the stand-in model: words from 0.65 s, the whole reply at
    1.45 s, and with the first two streams cut each message was still answered at 1.4 s and
    the third was asked for whole): export the web app without EXPO_PUBLIC_DEMO and with
    EXPO_PUBLIC_API_URL set to the address of apps/mobile/scripts/web-live.mjs, which serves
    the export and passes everything else to the API (how to run is in the file; CUT=<n> cuts
    streamed answers).
- Polish pass (2026-11-26, same thread; every screen walked in English and Arabic in the
  browser preview). Rules that came out of it:
  - Motion is src/ui/motion.tsx only: `Appear` (a short fade and lift, once) and `LoadingCards`
    (soft cards that keep a page's shape). Core `Animated`, opacity and position only, native
    driver on the phone, and the phone's "reduce motion" setting is honoured (fade, no movement,
    no pulse). No animation library and no new native module: this reaches builds over the air.
    Not checked on a real phone before it shipped (the same pattern as the toast and typing dots).
  - A screen's first load with nothing saved shows `LoadingCards` where its list will be, never
    a spinner in the middle of the page (People, a circle, Daftar sections and one section,
    splits and one split, Memories). A screen that failed with nothing saved shows its retry.
  - Chat: a message that arrives while the chat is open rises into place once
    (chat/entrance.ts, pure: the first list does not, and of a history that lands in one piece,
    as when signing in pulls it, only the newest four do, so older rows never rise as they are
    scrolled to; a reply's draft and the stored reply are one bubble; the screen hands the list
    over while it is drawn, because a bubble asks when it is first drawn). The first message of
    a local day has the day above it (chat/days.ts, pure: Today, Yesterday, weekday, then the
    date) and a new day ends a run of bubbles. Scrolled up past about half a screen
    (`JUMP_AFTER`), a round button brings the newest message back (the list is inverted, so that
    is offset 0), and sending does the same.
  - Text boxes (`TextField`) show focus with the theme's colour and a soft ring
    (`shadow.focus`), not the browser's outline.
  - Numbers are written with Latin digits in Arabic too (`dateLocale` is ar-EG-u-nu-latn):
    never type Arabic-Indic digits into a string. What the user types is still read both ways
    (`parseAmount`, `parseContact`). Lists inside a sentence join with `listComma` (i18n).
  - On a card the main button is the positive one: Cancel is never the filled button
    (TaskCard), and a row's actions sit under it, not squeezed beside the title (private notes
    in the Daftar are laid out like `DaftarCard`). A streak beside a title is a flame and the
    number (`TrackerStreak`), with the words read out.
  - The browser preview has sample split bills (demo/server.web.ts, the shared `splitBill` math).
- Kept database connections (2026-11-26, same speed thread; apps/api/src/db-pool.ts). Opening a
  connection to the database is several round trips in a row (TCP, TLS, sign-in: about 0.5 s
  from US East). The pool let a connection go after 30 idle seconds, and one person using the
  app leaves the server quiet that long all the time, so most of their messages opened
  connections before anything else. Measured live before the fix (smoke run of 08:12Z, the last
  two streamed turns): first words 2.61 s after 35 quiet seconds, 1.46 s on the turn right after
  it; with the model's own time to its first words taken out, 1.54 s against 0.59 s.
  - Now a connection stays 5 minutes after its last use (DB_POOL_IDLE_MS, in ms, at most
    2^31-1: Node fires a longer timer at once), with a TCP sign of life every 10 s, so an idle one
    that died without a word is dropped within about 20 s. A query sent on a connection whose
    other end vanished still waits for TCP to give up (minutes), as before. The proactive tick goes through the same pool every minute, so a running server always has a
    few warm ones. `poolSettings()` holds the numbers; the server (db.ts), the API's tests
    (test/db.ts) and the speed harnesses all open their pool with `openPool` / `pgAdapter`.
  - Kept connections count against the pooler's ~15. `PatientPool` is pg's pool with one change:
    when a new connection is refused for lack of room (`isNoRoom`: Postgres 53300, Supabase's
    "max clients reached", PgBouncer's "no more connections allowed"), the pool stops growing
    at the connections it has and the query queues for one of them (pg's own queue; a refused
    query joins it at the back) instead of failing with a 500. Three seconds later it lets one
    more attempt through; the first connection that is let in lifts the limit and opens
    connections for the queries still waiting (pg only does that when its queue is stirred: they
    stayed on the few old connections; `#serveWaiting` calls pg's private `_pulseQueue`, and a
    test fails if it goes). A transaction waits for a connection as long as a query does
    (`transactionOptions.maxWait` 15 s in db.ts; Prisma's own 2 s turned a full pooler into
    500s for every write in a transaction). With no connection at all a
    query tries again for 10 s, then fails with the server's own words. Any other failure to
    connect passes through at once. The server's log says "db: no room for another connection
    at the pooler" (at most every 30 s) when it happens. Tests: db-pool.test.ts, with a
    stand-in client and on the real Postgres through a role that may hold two connections (the
    whole app runs on those two).
  - The pool counts its connections with pg's "connect" and "remove" events, because pg's own
    `totalCount` includes attempts that are still on their way, and pg starts the next queued
    query's attempt before it reports a failed one.
  - `PatientPool.connect(callback)` calls the callback in the same turn as pg's own, as pg's
    plain pool does: `pool.query()` puts its 'error' listener on the connection there. The first
    version went through a promise in between; a FATAL read together with the end of the last
    answer (a database restart or failover, 57P01) then reached a connection with no listener,
    was thrown out of the socket's handler and would have stopped the server (independent
    review, 2026-11-26; db-pool.test.ts runs both cases on a stand-in server on a real socket).
    Never put an `await` or `.then` between pg's callback and the caller's.
  - `pg` is a direct dependency of the API now. There must be one copy of it in the tree: the
    Prisma adapter takes a pool only if it is `instanceof` its own `pg.Pool` (the "is the pool
    Prisma runs on" test fails otherwise).
  - Measure: `npm run perf:quiet -w @fakkarni/evals -- [--rtt 100] [--quiet 35000] [--idle <ms>]`
    (evals/perf/quiet.ts; same database rule as `perf`) times a request after a quiet pause and
    the same one right after. At a 0.1 s round trip and 35 quiet seconds, the old pool
    (`--idle 30000`) → the new one: every tab's data 1.26 s → 0.74 s (0.63 s right after), one
    tab 0.53 s → 0.21 s (0.10 s), a chat turn besides the model 1.57 s → 0.74 s (0.74 s). The
    0.1 s that is left on a GET is the sign-in row (USER_CACHE_MS is 15 s) being looked up
    again. A local connection has no TLS (3 round trips, about 5 live): the live gain is larger.
  - The server hears a deploy's stop signal (same day). The container ran `sh -c "npx prisma
    migrate deploy && npx tsx src/server.ts"`: its first process was the shell, a stop signal
    (SIGTERM) goes to the first process only, and the shell does not pass it on. Seen in a
    process namespace (`unshare --pid --fork --mount-proc`, which gives the command a
    container's process 1): six seconds after the signal the server still answered. So
    `shutdown` in server.ts never ran in production, and an old server kept its connections
    until it was killed. The Dockerfile now ends in `exec node --import tsx src/server.ts` (tsx
    as the loader; no shell, npm or tsx command in front). In the same namespace, from an
    install made the way the image is: the stop signal came 1.2 s into a reply that takes 4 s,
    the reply arrived whole (streamed and plain), the server closed its connections and exited
    0 a tenth of a second later; a new connection after the signal is refused, which is what
    the deploy's overlap is for. GET /health says `pid`: 1 on the live server means the server
    is the first process (a start command set in Railway's dashboard would replace the
    Dockerfile's), and `version` now comes from apps/api/package.json (no npm in front, so no
    npm_package_version). server.test.ts keeps the command and the clean stop.
  - The stop (server.ts `shutdown`, after the independent review of 2026-11-26). Node's close()
    only closes connections that are idle at that moment: a reply in flight at the signal ended
    with `Connection: keep-alive`, and a caller that keeps its connections (the deploy's proxy)
    held the server open for Fastify's 72 s keep-alive, past the 60 s drain, so it was killed
    still holding its database connections; the first measurement above had a caller that
    closed its own. Now: the signal handlers go in before the first wait (a first process with
    no handler drops the signal); then the HTTP close and pg-boss's stop (20 s for a running
    tick) together, with idle connections closed every 250 ms and every connection at 40 s;
    then up to 5 s for pushes and dashboard rows the last requests started (`track` in
    lib/background.ts: `pushNotices`, `inBackground`); then the pool closes and the process
    exits 0, and at 55 s it exits whatever still hangs. server.test.ts runs a reply through a
    slow proxy to the database with SIGTERM in the middle and a caller that keeps its
    connection: exit within 5 s of the answer, no database connection left. Still deaf: a
    signal during module loading, and during `prisma migrate deploy` (sh is the first process
    then); a deploy superseded while it starts runs until it is killed.
  - Live: neither is deployed when this is written. After the deploy, the smoke test's turn
    "after the quiet" and the one "right after" should show the same "first byte" and the same
    "context" in "server ms" (they were 483 ms against 279 ms), and its /health line `"pid":1`;
    run it once with `quiet` 240 to see that a connection kept for minutes still answers. The
    deploy that brings this in still replaces a server that does not hear the signal.
  - More API instances, or a longer deploy overlap, need more room first: each instance holds up
    to 8 + 3. The pooler's pool size is a Supabase dashboard setting (Database settings,
    connection pooling); nobody has changed it.

## Milestones (PRD §8)
- [x] M1 Skeleton: monorepo, Expo placeholder screens, Fastify /health, Prisma schema, shared zod types, vitest
- [x] M2 Capture and local storage: chat UI, SQLite, outbox sync, POST/GET /messages
- [x] M3 Conversation and memory: persona, pipeline, Saved chip fixes, evals (101 cases; extraction ≥98%, native review of evals/out/review.csv still pending). Reply streaming came later (2026-11-26, see the repo notes).
- [x] M4 Notifications: local reminders + quick replies, push registration, pg-boss proactive messages with auto-slowdown
- [x] M5 Auth, sync and screens: Supabase sign-in (email link, phone OTP, Apple, Google), account linking + full sync, Upcoming/Money/Settings/Memories, export, delete. Home-screen widget (P1) deferred: expo-widgets needs the bundle ID and a dev build.
- [x] M6 Paywall: RevenueCat purchase/restore, webhook + refresh, chat lock (data readable), trial-ending notice
- [x] M7 Hardening: Sentry, rate limits + daily cap, retries, admin dashboard with AI cost per user, EAS profiles, Dockerfile. Store submission steps are manual (see README launch checklist).
