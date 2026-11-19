import { defineConfig } from "prisma/config";

// DATABASE_URL comes from the environment (`.env` is loaded by the npm scripts / your shell).
// A placeholder lets `prisma generate` run without a database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
