import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { CreateDaftarRequest, normalizeInviteCode, RespondDaftarRequest, type DaftarResponse, type ListDaftarResponse } from "@fakkarni/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { newInviteCode } from "../circles/rules";
import { canCancel, canNudge, canRespond, canSettle, confirmShareText, formatAmount, nudgeShareText, type Lang } from "../daftar/rules";
import { daftarUrl, postUpdate, respond, settle, toWireEntry, withPeople, type EntryWithPeople } from "../daftar/store";
import { baseUrl } from "./circles";

export interface DaftarRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  publicUrl?: string;
}

const IdParam = z.object({ id: z.uuid() });
const CodeParam = z.object({ code: z.string().min(4).max(20) });

/** Shared Daftar: debts two people both see. Free and unlimited. */
export const daftarRoutes: FastifyPluginAsync<DaftarRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);

  const langOf = (u: { language: string }): Lang => (u.language === "en" ? "en" : "ar");
  const who = (e: EntryWithPeople, userId: string): "creator" | "other" | null => (e.creatorId === userId ? "creator" : e.otherUserId === userId ? "other" : null);
  /** The entry, if the caller is one of its two people. */
  const mine = async (id: string, userId: string) => {
    const e = await prisma.daftarEntry.findUnique({ where: { id }, include: withPeople });
    const role = e ? who(e, userId) : null;
    return e && role ? { e, role } : null;
  };

  app.get("/daftar", async (req) => {
    const rows = await prisma.daftarEntry.findMany({
      where: { OR: [{ creatorId: req.user.id }, { otherUserId: req.user.id }], status: { not: "cancelled" } },
      include: withPeople,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const base = baseUrl(req, opts.publicUrl);
    return { entries: rows.map((e) => toWireEntry(e, req.user.id, base)) } satisfies ListDaftarResponse;
  });

  app.post("/daftar", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = CreateDaftarRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const b = body.data;
    if (b.other_user_id && (!b.circle_id || b.other_user_id === req.user.id)) return reply.code(400).send({ error: "invalid_body" });
    if (b.circle_id) {
      // Both people have to be in that circle.
      const ids = b.other_user_id ? [req.user.id, b.other_user_id] : [req.user.id];
      const members = await prisma.circleMember.count({ where: { circleId: b.circle_id, userId: { in: ids } } });
      if (members !== ids.length) return reply.code(404).send({ error: "not_found" });
    }
    const at = now();
    let entry: EntryWithPeople | null = null;
    for (let attempt = 0; !entry; attempt++) {
      try {
        entry = await prisma.daftarEntry.create({
          data: {
            code: newInviteCode(),
            creatorId: req.user.id,
            circleId: b.circle_id ?? null,
            otherName: b.other_name,
            otherUserId: b.other_user_id ?? null,
            direction: b.direction,
            amount: new Prisma.Decimal(b.amount),
            note: b.note || null,
            createdAt: at,
          },
          include: withPeople,
        });
      } catch (err) {
        if (attempt < 4 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    await prisma.event.create({ data: { userId: req.user.id, name: "daftar_created", propsJson: { in_circle: Boolean(b.circle_id), to_member: Boolean(b.other_user_id) } } });
    const base = baseUrl(req, opts.publicUrl);
    if (entry.other) {
      // A circle member: it shows up in their app, and Zaki tells them in their chat.
      const lang = langOf(entry.other);
      const money = formatAmount(b.amount, entry.currency, lang);
      const name = req.user.name ?? (lang === "en" ? "Someone in your circle" : "حد من دايرتك");
      const line = lang === "en" ? `${name} noted ${money} between you in the Daftar. Have a look in Money and confirm if it's right 🌟` : `${name} سجّل ${money} بينكم في الدفتر. بص عليها في الفلوس وأكّد لو مظبوطة 🌟`;
      await postUpdate(prisma, entry.other.id, `daftar:${entry.id}:new`, line, at);
    }
    const res: DaftarResponse = {
      entry: toWireEntry(entry, req.user.id, base),
      share_text: entry.other ? null : confirmShareText({ lang: langOf(req.user), direction: entry.direction, amount: b.amount, currency: entry.currency, note: entry.note, url: daftarUrl(base, entry.code) }),
    };
    return reply.code(201).send(res);
  });

  /** The message to send on WhatsApp: the confirm link while pending, a kind nudge once confirmed. */
  app.post("/daftar/:id/share", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const found = params.success ? await mine(params.data.id, req.user.id) : null;
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { e, role } = found;
    const base = baseUrl(req, opts.publicUrl);
    const input = { lang: langOf(req.user), direction: e.direction, amount: Number(e.amount), currency: e.currency, note: e.note, url: daftarUrl(base, e.code) };
    let text: string | null = null;
    if (role === "creator" && e.status === "pending") text = confirmShareText(input);
    else if (canNudge(e.status, role, e.direction)) text = nudgeShareText(input);
    // Zaki reminds the other person only after they confirmed.
    if (!text) return reply.code(409).send({ error: "not_allowed" });
    return { entry: toWireEntry(e, req.user.id, base), share_text: text } satisfies DaftarResponse;
  });

  /** Opened from the link inside the app: the entry becomes visible to this account as the other person. */
  app.post("/daftar/open/:code", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = CodeParam.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    const code = normalizeInviteCode(params.data.code);
    // First account to open it becomes the other person; the creator just sees their own entry.
    await prisma.daftarEntry.updateMany({ where: { code, otherUserId: null, creatorId: { not: req.user.id }, status: { not: "cancelled" } }, data: { otherUserId: req.user.id } });
    const e = await prisma.daftarEntry.findUnique({ where: { code }, include: withPeople });
    if (!e || !who(e, req.user.id) || e.status === "cancelled") return reply.code(404).send({ error: "not_found" });
    return { entry: toWireEntry(e, req.user.id, baseUrl(req, opts.publicUrl)), share_text: null } satisfies DaftarResponse;
  });

  app.post("/daftar/:id/respond", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = RespondDaftarRequest.safeParse(req.body);
    const found = params.success && body.success ? await mine(params.data.id, req.user.id) : null;
    if (!found || !body.success) return reply.code(found ? 400 : 404).send({ error: found ? "invalid_body" : "not_found" });
    if (!canRespond(found.e.status, found.role)) return reply.code(409).send({ error: "not_allowed" });
    const e = await respond(prisma, found.e.id, body.data.answer, "app", now());
    if (!e) return reply.code(409).send({ error: "not_allowed" });
    return { entry: toWireEntry(e, req.user.id, baseUrl(req, opts.publicUrl)), share_text: null } satisfies DaftarResponse;
  });

  app.post("/daftar/:id/settle", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const found = params.success ? await mine(params.data.id, req.user.id) : null;
    if (!found) return reply.code(404).send({ error: "not_found" });
    const e = canSettle(found.e.status) ? await settle(prisma, found.e.id, req.user.id, now()) : null;
    if (!e) return reply.code(409).send({ error: "not_allowed" });
    return { entry: toWireEntry(e, req.user.id, baseUrl(req, opts.publicUrl)), share_text: null } satisfies DaftarResponse;
  });

  app.post("/daftar/:id/cancel", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const found = params.success ? await mine(params.data.id, req.user.id) : null;
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!canCancel(found.e.status, found.role)) return reply.code(409).send({ error: "not_allowed" });
    const changed = await prisma.daftarEntry.updateMany({ where: { id: found.e.id, status: { in: ["pending", "disputed"] } }, data: { status: "cancelled" } });
    if (changed.count === 0) return reply.code(409).send({ error: "not_allowed" });
    return reply.code(204).send();
  });
};
