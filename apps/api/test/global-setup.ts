import { execSync } from "node:child_process";

/** Apply migrations to the test database once per run (skipped when TEST_DATABASE_URL is unset). */
export default function setup() {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) return;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
