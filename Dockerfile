# Fakkarni API (Fastify + Prisma + pg-boss). Build from the repo root:
#   docker build -t fakkarni-api .
# Railway / Fly.io: set DATABASE_URL and the other variables from apps/api/.env.example.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Prisma's migration engine needs OpenSSL, which the slim image leaves out.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Manifests first (all workspaces, so the lockfile matches), then install only the API's deps.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY evals/package.json evals/
RUN npm ci -w @fakkarni/api -w @fakkarni/shared --ignore-scripts

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate

WORKDIR /app/apps/api
EXPOSE 3000
# Apply pending migrations, then start (pg-boss creates its own schema on start).
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
