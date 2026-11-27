import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { SESSION_CONSENT_VERSION, SessionConsentRequest, SessionMessageRequest, StartSessionRequest, type SessionResponse, type SessionState } from "@fakkarni/shared";
import type { FriendModel } from "../ai/model";
import { hasProAccess } from "../billing/family";
import type { PrismaClient, User } from "../generated/prisma/client";
import { helplineFor } from "../persona/prompt";
import { CLOSE_LINE, freeSessions, isIdle, NOT_A_DOCTOR, opener, WEEK_MS } from "../session/rules";
import { nextAt, sessionTurn, toWireMessage, toWireSession, userLang, type SessionWithMessages } from "../session/store";

export interface SessionRoutesOptions {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  now?: () => Date;
  model?: FriendModel;
  /** Off by default: Session stays closed until its evals have been run against the model. */
  enabled?: boolean;
}

const IdParam = z.object({ id: z.uuid() });
const messages = { messages: { orderBy: { createdAt: "asc" } } } as const;

/**
 * Session: a private space to reflect. Adults only, separate consent, own tables. Nothing
 * here reads or writes the chat, memories or summaries; analytics events carry no content.
 */
export const sessionRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (app, opts) => {
  const { prisma } = opts;
  const now = opts.now ?? (() => new Date());
  app.addHook("preHandler", opts.authenticate);
  // Switched off: reading the state and deleting one's data still work; nothing else does.
  app.addHook("preHandler", async (req, reply) => {
    if (!opts.enabled && req.method === "POST") return reply.code(404).send({ error: "session_unavailable" });
  });

  /** 18+: anyone marked as a teen in a family circle cannot use Session. */
  const isTeen = async (userId: string) => (await prisma.circleMember.count({ where: { userId, familyRole: "teen" } })) > 0;
  const consentOf = (userId: string) => prisma.sessionConsent.findUnique({ where: { userId } });

  /** The open session, closing one that was left idle. */
  async function openSession(userId: string, at: Date): Promise<SessionWithMessages | null> {
    const s = await prisma.reflectSession.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: "desc" }, include: messages });
    if (!s) return null;
    if (isIdle(s.startedAt, s.messages.at(-1)?.createdAt ?? null, at)) {
      await prisma.reflectSession.update({ where: { id: s.id }, data: { endedAt: at } });
      return null;
    }
    return s;
  }
  const allowance = async (user: User, at: Date) => {
    const recent = await prisma.reflectSession.findMany({ where: { userId: user.id, startedAt: { gt: new Date(at.getTime() - WEEK_MS) } }, select: { startedAt: true } });
    return freeSessions(recent.map((r) => r.startedAt), await hasProAccess(prisma, user, at), at);
  };
  /** Gate for everything but reading the state: adult, consented. Sends the refusal itself. */
  const ready = async (user: User, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): Promise<boolean> => {
    if (await isTeen(user.id)) return (reply.code(403).send({ error: "adults_only" }), false);
    if (!(await consentOf(user.id))) return (reply.code(403).send({ error: "consent_required" }), false);
    return true;
  };

  app.get("/session", async (req) => {
    const at = now();
    const [teen, consent, open, free, moods] = await Promise.all([
      isTeen(req.user.id),
      consentOf(req.user.id),
      openSession(req.user.id, at),
      allowance(req.user, at),
      prisma.reflectSession.findMany({ where: { userId: req.user.id }, orderBy: { startedAt: "desc" }, take: 30, select: { startedAt: true, mood: true } }),
    ]);
    const res: SessionState = {
      available: Boolean(opts.enabled),
      allowed: !teen,
      consented: Boolean(consent),
      free_left: free.left,
      next_free_at: free.nextAt?.toISOString() ?? null,
      open: open ? toWireSession(open) : null,
      moods: moods.reverse().map((m) => ({ at: m.startedAt.toISOString(), mood: Math.min(5, Math.max(1, m.mood)) })),
      helpline: helplineFor(req.user.timezone, req.user.city),
    };
    return res;
  });

  /** Separate, explicit consent for sensitive data, with the 18+ confirmation. */
  app.post("/session/consent", async (req, reply) => {
    const body = SessionConsentRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (await isTeen(req.user.id)) return reply.code(403).send({ error: "adults_only" });
    const data = { version: SESSION_CONSENT_VERSION, adult: true, consentedAt: now() };
    await prisma.sessionConsent.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id, ...data }, update: data });
    await prisma.event.create({ data: { userId: req.user.id, name: "session_consent", propsJson: { version: SESSION_CONSENT_VERSION } } });
    return reply.code(204).send();
  });

  app.post("/session/start", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = StartSessionRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!(await ready(req.user, reply))) return reply;
    const at = now();
    const existing = await openSession(req.user.id, at);
    if (existing) return { session: toWireSession(existing) } satisfies SessionResponse;
    const free = await allowance(req.user, at);
    // 402 = the app shows Zaki Pro, with the day the next free session opens.
    if (free.left === 0) return reply.code(402).send({ error: "session_limit", next_free_at: free.nextAt?.toISOString() ?? null });
    const lang = userLang(req.user);
    const session = await prisma.reflectSession.create({
      data: {
        userId: req.user.id,
        mode: body.data.mode,
        mood: body.data.mood,
        startedAt: at,
        // Every session opens with the "not a doctor" line, then one question. Templates, no AI call.
        messages: { create: [{ role: "zaki", text: NOT_A_DOCTOR[lang], createdAt: at }, { role: "zaki", text: opener(body.data.mode, body.data.mood, lang), createdAt: new Date(at.getTime() + 1) }] },
      },
      include: messages,
    });
    await prisma.event.create({ data: { userId: req.user.id, name: "session_started", propsJson: { mode: body.data.mode } } });
    return reply.code(201).send({ session: toWireSession(session) } satisfies SessionResponse);
  });

  app.post("/session/:id/messages", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const body = SessionMessageRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!(await ready(req.user, reply))) return reply;
    const s = await prisma.reflectSession.findFirst({ where: { id: params.data.id, userId: req.user.id }, include: messages });
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.endedAt) return reply.code(409).send({ error: "session_ended" });
    const turn = await sessionTurn({ prisma, model: opts.model, log: app.log }, req.user, s, body.data.text, now());
    return { messages: turn.messages.map(toWireMessage), ended: turn.ended };
  });

  app.post("/session/:id/end", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const s = params.success ? await prisma.reflectSession.findFirst({ where: { id: params.data.id, userId: req.user.id }, include: messages }) : null;
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (!s.endedAt) {
      const at = now();
      await prisma.reflectSession.update({ where: { id: s.id }, data: { endedAt: at, messages: { create: { role: "zaki", text: CLOSE_LINE[userLang(req.user)], createdAt: nextAt(s, at) } } } });
    }
    const after = await prisma.reflectSession.findUniqueOrThrow({ where: { id: s.id }, include: messages });
    return { session: toWireSession(after) } satisfies SessionResponse;
  });

  /**
   * "Remind me": the user chooses to turn Zaki's suggested step into one of their reminders.
   * Only the short step title leaves Session, and only on this tap.
   */
  app.post("/session/steps/:id/remind", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    const m = params.success ? await prisma.reflectMessage.findFirst({ where: { id: params.data.id, session: { userId: req.user.id }, stepTitle: { not: null } } }) : null;
    if (!m?.stepTitle) return reply.code(404).send({ error: "not_found" });
    const changed = await prisma.reflectMessage.updateMany({ where: { id: m.id, stepAccepted: false }, data: { stepAccepted: true } });
    if (changed.count > 0) {
      const at = m.stepAt && m.stepAt > now() ? m.stepAt : null;
      await prisma.item.create({ data: { userId: req.user.id, type: at ? "reminder" : "task", title: m.stepTitle, dueAt: at, remindAt: at, createdAt: now() } });
    }
    return reply.code(204).send();
  });

  /** One tap: delete every session, every message and the consent. */
  app.delete("/session", async (req, reply) => {
    await prisma.$transaction([prisma.reflectSession.deleteMany({ where: { userId: req.user.id } }), prisma.sessionConsent.deleteMany({ where: { userId: req.user.id } })]);
    await prisma.event.create({ data: { userId: req.user.id, name: "session_data_deleted", propsJson: {} } });
    return reply.code(204).send();
  });
};
