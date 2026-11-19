# Fakkarni (فكّرني)

An AI friend that chats in Egyptian Arabic, Franco or English, remembers what you
mention, and reminds you the way a friend would. Paid iOS/Android app. The spec is in
[docs/PRD.pdf](docs/PRD.pdf), and the working rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Layout
```
apps/mobile      Expo app (expo-router, SDK 58)
apps/api         Fastify API + Prisma schema (Postgres)
packages/shared  zod schemas + types shared by app and API
```

## Run it
Requires Node 20+.
```sh
npm install
npm test                  # vitest in every workspace
npm run typecheck

cp apps/api/.env.example apps/api/.env
npm run dev:api           # http://localhost:3000/health
npm run dev:mobile        # scan the QR code with Expo Go
```
On a real phone, the app finds the API at your laptop's LAN address on port 3000 (the
same machine that serves Metro). Set `EXPO_PUBLIC_API_URL` to point somewhere else.

Database (needed from M2 on): set `DATABASE_URL` in `apps/api/.env`, then
`npm run prisma:migrate -w @fakkarni/api`.
