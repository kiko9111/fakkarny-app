import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../generated/prisma/client";
import type { Metrics } from "../observability/metrics";

/**
 * FR-15 admin dashboard: users, subscriptions, error rate, AI cost per user.
 * Password-protected (HTTP Basic, user "admin") and shows NO chat content — only counts,
 * plans and costs. Users are identified by a short id prefix.
 */
export interface AdminOptions {
  prisma: PrismaClient;
  password?: string;
  metrics: Metrics;
  now?: () => Date;
}

const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function adminStats(prisma: PrismaClient, metrics: Metrics, now: Date) {
  const day = new Date(now.getTime() - 86400_000);
  const week = new Date(now.getTime() - 7 * 86400_000);
  const month = new Date(now.getTime() - 30 * 86400_000);
  const [users, newUsers7d, active1d, active7d, plans, msgs1d, crisis7d] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.user.count({ where: { lastUserMessageAt: { gte: day } } }),
    prisma.user.count({ where: { lastUserMessageAt: { gte: week } } }),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.message.count({ where: { role: "user", createdAt: { gte: day } } }),
    prisma.event.count({ where: { name: "crisis_flag", createdAt: { gte: week } } }),
  ]);
  const costRows = await prisma.$queryRaw<{ user_id: string; cost: number; calls: bigint }[]>`
    SELECT user_id::text AS user_id, COALESCE(SUM((props_json->>'cost_usd')::float), 0) AS cost, COUNT(*) AS calls
    FROM events WHERE name = 'ai_call' AND created_at >= ${month}
    GROUP BY user_id ORDER BY cost DESC`;
  const planCount = Object.fromEntries(plans.map((p) => [p.plan, p._count._all])) as Record<string, number>;
  const paying = (planCount["monthly"] ?? 0) + (planCount["yearly"] ?? 0);
  const everSubscribed = paying + (planCount["trial"] ?? 0) + (planCount["expired"] ?? 0);
  const totalCost = costRows.reduce((s, r) => s + Number(r.cost), 0);
  return {
    generated_at: now.toISOString(),
    users: { total: users, new_7d: newUsers7d, active_1d: active1d, active_7d: active7d },
    plans: {
      none: planCount["none"] ?? 0,
      trial: planCount["trial"] ?? 0,
      monthly: planCount["monthly"] ?? 0,
      yearly: planCount["yearly"] ?? 0,
      expired: planCount["expired"] ?? 0,
    },
    conversion: { paying, ever_subscribed: everSubscribed, paid_share_of_subscribed: everSubscribed ? paying / everSubscribed : 0 },
    messages_1d: msgs1d,
    crisis_flags_7d: crisis7d,
    ai_cost_30d: {
      total_usd: totalCost,
      per_active_user_usd: costRows.length ? totalCost / costRows.length : 0,
      per_paying_user_usd: paying ? totalCost / paying : 0,
      target_per_paying_user_usd: 1.5,
      top_users: costRows.slice(0, 10).map((r) => ({ user: r.user_id.slice(0, 8), cost_usd: Number(r.cost), calls: Number(r.calls) })),
    },
    errors_24h: metrics.summary(),
  };
}

type Stats = Awaited<ReturnType<typeof adminStats>>;

function page(s: Stats): string {
  const usd = (n: number) => `$${n.toFixed(4)}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const row = (k: string, v: string | number, cls = "") => `<tr><th>${k}</th><td class="${cls}">${v}</td></tr>`;
  const c = s.ai_cost_30d;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fakkarni admin</title>
<style>body{font-family:system-ui,sans-serif;margin:24px auto;max-width:860px;padding:0 16px;color:#1f1a17;background:#fffbf5}h1{font-size:22px}h2{font-size:15px;color:#6b625b;margin-top:28px}table{border-collapse:collapse;width:100%;background:#fff}th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}th{font-weight:500;color:#6b625b;width:55%}.warn{color:#b3261e;font-weight:600}</style></head><body>
<h1>Fakkarni admin</h1><p>No chat content is shown here. Generated ${s.generated_at}.</p>
<h2>Users</h2><table>${row("Total", s.users.total)}${row("New (7 days)", s.users.new_7d)}${row("Active (24 h)", s.users.active_1d)}${row("Active (7 days)", s.users.active_7d)}${row("User messages (24 h)", s.messages_1d)}</table>
<h2>Subscriptions</h2><table>${row("No plan yet", s.plans.none)}${row("Trial", s.plans.trial)}${row("Monthly", s.plans.monthly)}${row("Yearly", s.plans.yearly)}${row("Expired", s.plans.expired)}${row("Paying share of ever-subscribed", pct(s.conversion.paid_share_of_subscribed))}</table>
<h2>AI cost (30 days)</h2><table>${row("Total", usd(c.total_usd))}${row("Per active user", usd(c.per_active_user_usd))}${row("Per paying user (target under $1.50)", usd(c.per_paying_user_usd), c.per_paying_user_usd > c.target_per_paying_user_usd ? "warn" : "")}
${c.top_users.map((u) => row(`User ${u.user}…`, `${usd(u.cost_usd)} · ${u.calls} calls`)).join("")}</table>
<h2>Health (24 h)</h2><table>${row("Requests", s.errors_24h.requests)}${row("5xx errors", s.errors_24h.errors)}${row("Error rate", pct(s.errors_24h.errorRate), s.errors_24h.errorRate > 0.01 ? "warn" : "")}${row("Crisis flags (7 days, safety review only)", s.crisis_flags_7d)}</table>
</body></html>`;
}

export const adminRoutes: FastifyPluginAsync<AdminOptions> = async (app, opts) => {
  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization ?? "";
    const given = h.startsWith("Basic ") ? Buffer.from(h.slice(6), "base64").toString() : "";
    if (!opts.password || !eq(given, `admin:${opts.password}`)) {
      return reply.code(401).header("www-authenticate", 'Basic realm="fakkarni-admin"').send({ error: "unauthorized" });
    }
  };
  app.addHook("preHandler", guard);
  app.get("/admin/stats", async () => adminStats(opts.prisma, opts.metrics, opts.now?.() ?? new Date()));
  app.get("/admin", async (_req, reply) => {
    const stats = await adminStats(opts.prisma, opts.metrics, opts.now?.() ?? new Date());
    return reply.type("text/html; charset=utf-8").header("cache-control", "no-store").send(page(stats));
  });
};
