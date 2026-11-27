import type { FastifyBaseLogger } from "fastify";
import { FriendResponse, phoneReplySchema, PhoneOutput, TRACKER_TEMPLATES, understand, type TrackerKind } from "@fakkarni/shared";
import { Prisma } from "../generated/prisma/client";
import { addUsage, costUsd, FRIEND_MODEL, type ChatTurn, type FriendModel, type Usage } from "../ai/model";
import { helplineFor, PERSONA_PROMPT, PERSONA_VERSION } from "../persona/prompt";
import { localToUtc, toLocalIso } from "../lib/time";
import { applyActions } from "./apply";
import { loadContext, mustReplyInArabic, PHONE_RECENT_MESSAGES, renderContext, renderPhoneReplyContext, userTexts } from "./context";
import { answerQuestion, readQuestion } from "./questions";
import { cleanPhoneReply, describeUnderstood, PHONE_REPLY_PROMPT, PHONE_REPLY_VERSION, templateReply } from "../persona/phone-reply";
import { understandInput } from "./understand-input";
import { detectScript, FALLBACK_REPLY, fastReply, helplineMessage, looksDistressed, looksLikeCrisis, looksLikeReminderWork, promisesReminder, replyLang, saysReminderSet, UNSET_REMINDER_REPLY, wantsAlarm, type ReplyLang } from "./rules";
import { createDraftRelay } from "./draft";
import { summarizeIfNeeded } from "./summarize";
import { inBackground } from "../lib/background";
import { logEntryWithStats, loggedLine, trackerFastPath } from "../trackers/store";
import { moneyFastPath } from "../money/store";
import { addToList, listFastPath } from "../lists/chat";
import { briefFastPath } from "../brief/chat";
import { isPlainYes, pendingStatus, statusDoneReply } from "../proactive/status";
import type { MessagePipeline } from "./types";
import { answerCard, attachCards, debtCards, runAppActions } from "../chat/actions";
import { settleCards } from "../chat/more-actions";
import { CANCELLED_REPLY, CONFIRMED_REPLY, HOME_REPLY, homeCheckin, isCancel, isConfirm, isUndo, LABEL, storedCards, type StoredCard } from "../chat/cards";
import { UNDO_WINDOW_MS, undoCard } from "../chat/undo";
import type { Message } from "../generated/prisma/client";
import { parsePlaceTrigger } from "@fakkarni/shared";
import { withPlace } from "./place";

const EMPTY_ACTIONS: Pick<FriendResponse, "create_items" | "update_items" | "save_memories"> & { app_actions?: FriendResponse["app_actions"] } = {
  create_items: [],
  update_items: [],
  save_memories: [],
};

/**
 * PRD §6 conversation pipeline: context → one Claude call (reply + actions) → zod-validated
 * actions applied in a transaction. Never logs message content (CLAUDE.md).
 */
/** PRD §7 cost lever: a soft daily cap for heavy chatters (messages still saved, AI paused). */
export const DAILY_MESSAGE_CAP = 150;
/**
 * Reminder messages past the free allowance still reach the model ("reminders stay free"),
 * up to this many a day, so the bypass can't become unlimited free chat.
 */
export const FREE_REMINDER_CALLS_PER_DAY = 20;

const CAP_REPLY: Record<ReplyLang, string> = {
  arabic: "وصلنا لحد الكلام بتاع النهارده 😅 هفضل فاكر كل اللي تبعته، ونكمل كلامنا عادي بكرة.",
  english: "We've hit today's chat limit 😅 I'll still keep everything you send, and full replies are back tomorrow.",
};

/** Free AI allowance used up: Zaki says so warmly (no AI call), with a Pro button. */
const ALLOWANCE_FIRST: Record<ReplyLang, string> = {
  arabic: "خلّصنا رسايلي المجانية بتاعة النهارده 🌟 بكرة نكمّل من تاني، وكل حاجة سجلناها محفوظة. ولو حابب نتكلم من غير حد، زكي برو مستنيك.",
  english: "That's all my free messages for today 🌟 We'll pick up again tomorrow, and everything we saved is safe. If you'd like to keep chatting with no limit, Zaki Pro is here for you.",
};
const ALLOWANCE_AGAIN: Record<ReplyLang, string> = {
  arabic: "رسايل النهارده خلصت، بس رسالتك وصلتني ومحفوظة. نكمّل بكرة إن شاء الله 🌟",
  english: "Today's messages are used up, but I've kept yours. Talk tomorrow 🌟",
};

export function createConversationPipeline(deps: { model: FriendModel; log?: FastifyBaseLogger; dailyCap?: number }): MessagePipeline {
  const { model, log } = deps;
  const dailyCap = deps.dailyCap ?? DAILY_MESSAGE_CAP;

  return async ({ prisma, user, message, now, aiAllowance, requireSubscription, brain, timing, draft }) => {
    // Where the wait goes (ms since the start, numbers only): sent back as Server-Timing.
    const t0 = Date.now();
    const mark = (k: string) => {
      if (timing) timing[k] = Date.now() - t0;
    };
    const script = replyLang(detectScript(message.text));
    const crisisKeyword = looksLikeCrisis(message.text);
    const dayStart = localToUtc(`${toLocalIso(now, user.timezone).slice(0, 10)}T00:00`, user.timezone);

    // Every database round trip adds to the wait for the reply, so the lookups that don't
    // depend on each other run together, and the context for the model loads while the rule
    // checks below run (most messages reach the model). A message the rules answer on their
    // own words ("thanks", an emoji) never reaches the model: its context is not loaded at all
    // (it was ~25 lookups that held the rule checks' own lookups back in the queue).
    const canned = crisisKeyword ? null : fastReply(message.text, script);
    let ctxEarly: ReturnType<typeof loadContext> | null = canned ? null : loadContext(prisma, user, now);
    ctxEarly?.catch(() => {});
    const [today, lastFriend] = await Promise.all([
      crisisKeyword ? Promise.resolve(0) : prisma.message.count({ where: { userId: user.id, role: "user", createdAt: { gte: dayStart } } }),
      prisma.message.findFirst({ where: { userId: user.id, role: "friend", createdAt: { lte: message.createdAt } }, orderBy: { createdAt: "desc" } }),
    ]);

    // 0. Fair-use cap (never applied to crisis messages).
    if (!crisisKeyword) {
      if (today > dailyCap) {
        // Tell them once, honestly; after that just save quietly.
        const replies = today === dailyCap + 1 ? [CAP_REPLY[script]] : [];
        if (replies.length) await event(prisma, user.id, "daily_cap_hit", {});
        return applyActions(prisma, { user, message, replies, response: EMPTY_ACTIONS, now });
      }
    }

    // 0a. "Yes" / "no" to a card Zaki is waiting on ("Ask Mona to buy bread?"): done by rules.
    const answered = crisisKeyword ? null : await answerPendingCards(prisma, user, message, lastFriend, script, now, requireSubscription ?? false);
    if (answered) {
      counted(prisma, user.id, "reply_fast_path", { card: true });
      return answered;
    }

    // 0b. "Undo" / "تراجع": takes back Zaki's latest change of the user's own, by rules.
    const undone = crisisKeyword || !isUndo(message.text) ? null : await undoLatest(prisma, user, message, script, now);
    if (undone) {
      counted(prisma, user.id, "reply_fast_path", { undo: true });
      return undone;
    }

    // 0c. "وصلت البيت" / "I'm home": offer to tell the family (a card; nothing goes out without a yes).
    const home = crisisKeyword ? null : homeCheckin(message.text);
    if (home) {
      const ran = await runAppActions(prisma, user, [{ kind: "checkin", checkin_kind: home }], script, now, { requireSubscription: requireSubscription ?? false });
      if (ran.cards.some((c) => c.status === "pending")) {
        counted(prisma, user.id, "reply_fast_path", { checkin: true });
        return withCards(prisma, await applyActions(prisma, { user, message, replies: [HOME_REPLY[script]], response: EMPTY_ACTIONS, now }), ran.cards);
      }
    }

    // 0a'. A plain "yes" to Zaki's status check ("did you get to …?") closes it by rules.
    const status = crisisKeyword ? null : await answerStatusCheck(prisma, user, message, lastFriend, script, now);
    if (status?.result) return status.result;
    // Any other answer to a status check ("not yet, tomorrow") is reminder work: free past the allowance.
    const answersStatus = status?.pending === true;

    // 1. Rules fast path: no AI for messages that carry nothing to remember.
    if (canned) {
      counted(prisma, user.id, "reply_fast_path", {});
      return applyActions(prisma, { user, message, replies: [canned], response: EMPTY_ACTIONS, now });
    }

    // 1a. Trackers by rules: "شربت مية" logs, "تابع معايا المية" starts one. No AI, no allowance used.
    const tracked = crisisKeyword ? null : await trackerFastPath(prisma, user, message.text, script, now);
    const closesReminder = tracked?.closesReminder === true;
    if (tracked && !closesReminder) {
      counted(prisma, user.id, "reply_fast_path", { tracker: true });
      return applyActions(prisma, { user, message, replies: [tracked.text], response: EMPTY_ACTIONS, now, ...(tracked.upsell ? { replyKind: "upsell" as const } : {}) });
    }

    // 1a'. Expenses and income by rules: "دفعت 300 بنزين" goes to a Daftar section. No AI call.
    const money = crisisKeyword || tracked ? null : await moneyFastPath(prisma, user, message.text, script, now);
    if (money) {
      counted(prisma, user.id, "reply_fast_path", { money: true });
      const result = await withCards(prisma, await applyActions(prisma, { user, message, replies: [money.text], response: EMPTY_ACTIONS, now }), money.cards ?? []);
      return { ...result, notices: [...(result.notices ?? []), ...money.notices.filter((n) => n.userId !== user.id)] };
    }

    // 1a''. Household lists by rules: "ضيف بيض للقايمة", "القايمة فيها ايه", "نازل السوبر ماركت". No AI call.
    const listed = crisisKeyword ? null : await listFastPath(prisma, user, message.text, script, now).catch(() => null);
    if (listed) {
      counted(prisma, user.id, "reply_fast_path", { list: true });
      const result = await withCards(prisma, await applyActions(prisma, { user, message, replies: [listed.text], response: EMPTY_ACTIONS, now }), listed.cards);
      return { ...result, notices: [...(result.notices ?? []), ...listed.notices.filter((n) => n.userId !== user.id)] };
    }

    // 1a‴. The daily news brief by rules: "ابعتلي أخبار الكورة كل يوم الساعة 8", "وقف الأخبار". No AI call.
    const briefed = crisisKeyword ? null : await briefFastPath(prisma, user, message.text, script, aiAllowance != null).catch(() => null);
    if (briefed) {
      counted(prisma, user.id, "reply_fast_path", { brief: true });
      return withCards(prisma, await applyActions(prisma, { user, message, replies: [briefed.text], response: EMPTY_ACTIONS, now }), briefed.cards);
    }

    // 1b. Free AI allowance. Rule-answered messages above don't count. Distress is never
    // blocked (the model must see it, to answer with care and flag a crisis), and reminder
    // work (asking for one, Done / Later) stays free up to a daily guard.
    // The phone's own model costs nothing: no allowance in that mode (pricing undecided, test mode).
    const limit = brain ? null : aiAllowance ?? null;
    let used = 0;
    let freeCall: "distress" | "reminder" | null = null;
    if (limit !== null) {
      used = await prisma.event.count({
        where: { userId: user.id, name: "ai_call", createdAt: { gte: dayStart }, propsJson: { path: ["purpose"], equals: "chat" } },
      });
      if (used >= limit) {
        if (crisisKeyword || looksDistressed(message.text)) freeCall = "distress";
        else if (closesReminder || answersStatus || looksLikeReminderWork(message.text)) {
          const freeToday = await prisma.event.count({
            where: { userId: user.id, name: "ai_call", createdAt: { gte: dayStart }, propsJson: { path: ["free"], equals: "reminder" } },
          });
          if (freeToday < FREE_REMINDER_CALLS_PER_DAY) freeCall = "reminder";
        }
      }
      if (used >= limit && !freeCall) {
        const toldToday = await prisma.event.count({ where: { userId: user.id, name: "ai_allowance_hit", createdAt: { gte: dayStart } } });
        await event(prisma, user.id, "ai_allowance_hit", { limit });
        const reply = toldToday === 0 ? ALLOWANCE_FIRST[script] : ALLOWANCE_AGAIN[script];
        const applied = await applyActions(prisma, { user, message, replies: [reply], response: EMPTY_ACTIONS, now, replyKind: "upsell" });
        return { ...applied, aiAllowance: { limit, used } };
      }
    }

    // 2. One model call with persona (cached) + context + recent chat.
    // A tracker step logged just above changes the numbers: load them again.
    mark("rules");
    ctxEarly ??= loadContext(prisma, user, now);
    const ctx = closesReminder ? await loadContext(prisma, user, now) : await ctxEarly;
    mark("context");
    const history = historyUpTo(ctx.recent, message);
    let replies: string[];
    let actions = EMPTY_ACTIONS;
    let crisis = crisisKeyword;
    let usage: Usage | null = null;
    let modelOk = false;
    let cloudInput: Parameters<FriendModel["respond"]>[0] | null = null;
    /** The reply's words on their way to the phone while the model writes them (pipeline/draft.ts). */
    let live: ReturnType<typeof createDraftRelay> | undefined;
    let streamMode: string | null = null;
    /** A streamed try of this turn was lost (refused, too slow, cut off) and the turn asked for again. */
    let streamLost: string | null = null;
    /** Phone mode: what wrote the reply when the phone's model wasn't asked (counts only). */
    let codeReply: string | null = null;
    const nowLocal = toLocalIso(now, user.timezone).slice(0, 16);
    if (brain) {
      // Phone brain (owner decision, 2026-11-25: "the AI is for chatting only, the tasks are math"):
      // the rule engine decides every action here, on the server, the same way on both passes.
      // The phone's model only writes the reply, told what was done or what to ask.
      const understood = understand(understandInput(ctx, message.text));
      const titles = Object.fromEntries(ctx.openItems.map((i) => [i.id, i.title]));
      // Questions about the user's own data ("what do I have this week?", "sagelt kam?") are
      // answered by code with the real numbers: the small model can't read them reliably.
      const question = !crisisKeyword && understood.chat && !understood.ask ? readQuestion(message.text) : null;
      // When the code decided everything (something to save, change or ask), its own words are
      // the reply at once: no second round trip and no on-phone model run (that took 20-40 s
      // on kareem's Pixel 8 and left messages on "Sending…"). The model only writes small talk.
      const codeDecides = !understood.chat || Boolean(understood.ask);
      if (question || codeDecides) {
        const decided = FriendResponse.safeParse({ reply: ["…"], create_items: understood.create_items, update_items: understood.update_items, save_memories: understood.save_memories, app_actions: understood.app_actions, crisis: understood.crisis });
        if (!decided.success) log?.warn({ issues: decided.error.issues.length }, "rule engine output failed validation");
        actions = question ? EMPTY_ACTIONS : decided.success ? decided.data : EMPTY_ACTIONS;
        crisis ||= understood.crisis;
        replies = question
          ? answerQuestion(question, { items: ctx.openItems, ...(ctx.app ? { app: ctx.app } : {}), userId: user.id, tz: user.timezone, now }, script)
          : templateReply(understood, nowLocal, script, titles);
        modelOk = true;
        codeReply = question ? `question:${question.kind}` : understood.ask ? "ask" : "done";
      } else if (brain.output === undefined) {
        // First pass: nothing is stored; the phone sends the same message again with its reply.
        return {
          replies: [],
          items: [],
          memories: [],
          needsBrain: {
            system: PHONE_REPLY_PROMPT,
            context: `${renderPhoneReplyContext(ctx)}\n${describeUnderstood(understood, nowLocal, titles)}`,
            history: history.slice(-PHONE_RECENT_MESSAGES),
            persona: PHONE_REPLY_VERSION,
            lang: script,
            schema: phoneReplySchema(script) as unknown as Record<string, unknown>,
          },
        };
      } else {
        const said = PhoneOutput.safeParse(brain.output);
        // Only bubbles in the right script, without Modern Standard words or leaked JSON (cleanPhoneReply).
        const wrote = said.success ? cleanPhoneReply(said.data.reply, script) : [];
        modelOk = wrote.length > 0;
        const decided = FriendResponse.safeParse({
          reply: wrote.length ? wrote : ["…"],
          create_items: understood.create_items,
          update_items: understood.update_items,
          save_memories: understood.save_memories,
          app_actions: understood.app_actions,
          crisis: understood.crisis,
        });
        if (!decided.success) log?.warn({ issues: decided.error.issues.length }, "rule engine output failed validation");
        actions = decided.success ? decided.data : EMPTY_ACTIONS;
        // Small phone models raise the crisis flag on plain chat ("enta gamed ya zaki" did, in the
        // phone eval), which would bury a friendly reply under helpline numbers. Their flag counts
        // when the message shows distress (looksDistressed, a wider net than the crisis keywords);
        // the keyword safety net above always counts.
        crisis ||= understood.crisis || (said.success && said.data.crisis && looksDistressed(message.text));
        // The model's words, unless it failed or promises a reminder the code didn't set: then the code's own words.
        // When the code needs an answer (a missing time / amount / person, or "really cancel?") the reply
        // must ask: a small model that only says "تمام" leaves the user thinking it was saved.
        const skippedAsk = Boolean(understood.ask) && !wrote.some((w) => /[؟?]/.test(w));
        replies = modelOk && !skippedAsk && !(promisesReminder(wrote) && !setsReminder(actions)) ? wrote : templateReply(understood, nowLocal, script, titles);
      }
    } else {
      const modelInput = { system: PERSONA_PROMPT, context: renderContext(ctx), history, requireArabic: mustReplyInArabic(userTexts(ctx.recent), user.language === "en" ? "english" : "arabic"), todayLocal: nowLocal.slice(0, 10), nowLocal };
      // A failure that may come from the stored chat itself (a request the API refuses, or output that
      // doesn't validate) gets one more try with only the message being answered, so one bad line in
      // the recent chat can't turn every reply into "my brain froze". Timeouts and outages don't.
      const tries = [modelInput, { ...modelInput, history: history.slice(-1) }];
      replies = [FALLBACK_REPLY[script]];
      // The words go to the phone while they are written, when it asked for them. Not on a
      // message the crisis net caught: that reply goes out whole, with the helpline in it, as it
      // always has. A bubble in the wrong script is asked for again (ai/model.ts), so it is never shown.
      if (draft && !crisisKeyword) live = createDraftRelay(draft, { promises: saysReminderSet, ...(modelInput.requireArabic ? { mustContain: ARABIC_LETTER } : {}) });
      for (const [n, input] of tries.entries()) {
        try {
          const result = await model.respond(input, live);
          usage = usage ? addUsage(usage, result.usage) : result.usage;
          if (result.ok) {
            modelOk = true;
            replies = result.output.reply;
            actions = result.output;
            crisis ||= result.output.crisis;
            streamMode = result.stream ?? null;
            streamLost = result.streamLost ?? null;
            if (n > 0) await event(prisma, user.id, "ai_recovered", { short_history: true }).catch(() => {});
            break;
          }
          log?.warn({ reason: result.reason }, "friend model returned no usable output");
          await event(prisma, user.id, "ai_error", { status: null, kind: result.reason, attempt: n }).catch(() => {});
          if (result.reason === "refusal") break;
        } catch (err) {
          log?.error({ err: errorSummary(err) }, "friend model call failed");
          // Counted (status and a coarse kind, never text) so /admin shows why replies fail.
          const props = aiErrorProps(err);
          await event(prisma, user.id, "ai_error", { ...props, attempt: n }).catch(() => {});
          // Outages, timeouts and account problems won't be fixed by a shorter chat: stop there.
          if (["timeout", "rate_limit", "overloaded", "credit"].includes(props.kind) || (props.status !== null && props.status !== 400)) break;
        }
      }
      cloudInput = modelInput;
    }
    mark("model");

    // 3. Wellbeing safety net: crisis replies always carry helpline info, and never create items.
    if (crisis) {
      const helpline = helplineFor(user.timezone);
      const digits = helpline.match(/\d{3,}/)?.[0];
      if (!digits || !replies.some((r) => r.includes(digits))) replies = [...replies, helplineMessage(script, helpline)];
      actions = EMPTY_ACTIONS;
      // Flagged for safety review only, never marketing; no content stored (PRD §7).
      await event(prisma, user.id, "crisis_flag", { keyword: crisisKeyword });
    }

    // 3b. Asked for an alarm: what Zaki creates or changes this turn rings as one (the model
    // sometimes answered "set" with alarm false). Off words turn it off.
    const alarm = crisis ? null : wantsAlarm(message.text);
    if (alarm !== null) {
      const timed = (i: { type: string }) => i.type === "reminder" || i.type === "task";
      if (actions.create_items.some(timed)) actions = { ...actions, create_items: actions.create_items.map((i) => (timed(i) ? { ...i, alarm } : i)) };
      else if (actions.update_items.length) actions = { ...actions, update_items: actions.update_items.map((u) => ({ ...u, alarm })) };
    }

    // 3b'. A place reminder ("when I'm at the supermarket"): the place goes on what the turn
    // creates. The model is not asked for it (the output schema has no room to spare); code reads it.
    const trigger = crisis ? null : parsePlaceTrigger(message.text);
    if (trigger) actions = withPlace(actions, trigger, message.text);

    // 3c. Zaki never says a reminder or alarm is set unless this turn set one. A reply that
    // promises one with nothing behind it gets one retry with the mistake spelled out; then an
    // item set in the last two hours counts (the user just confirmed it), else an honest reply.
    let shown: Awaited<ReturnType<typeof recentlySetItem>> = null;
    if (!crisis && usage && cloudInput && promisesReminder(replies) && !setsReminder(actions)) {
      await event(prisma, user.id, "reminder_claim_unset", {});
      // The reply is written again: what the phone was shown of the first one goes.
      live?.onRestart();
      const retry = await model.respond({ ...cloudInput, context: `${cloudInput.context}\n\n${UNSET_CHECK}` }, live).catch(() => null);
      if (retry) usage = addUsage(usage, retry.usage);
      if (retry?.ok && !retry.output.crisis && (setsReminder(retry.output) || !promisesReminder(retry.output.reply))) {
        replies = retry.output.reply;
        actions = retry.output;
      } else {
        live?.onRestart();
        shown = await recentlySetItem(prisma, user.id, now);
        if (!shown) replies = [UNSET_REMINDER_REPLY[script]];
      }
      await event(prisma, user.id, "reminder_claim_checked", { fixed: setsReminder(actions), existing: Boolean(shown) });
    }

    // 4. Apply actions + store replies, then the app actions (money, trackers, circles) as cards.
    // The cost event is written alongside, not after.
    // Things to buy go on the household list everyone in the circle sees, not into the user's
    // own plans (2026-11-26). The model's list items and the rule engine's land there the same way.
    const listThings = crisis || actions.app_actions?.some((a) => a.kind === "list_add") ? [] : actions.create_items.filter((i) => i.type === "list_item").map((i) => i.title);
    if (!crisis && actions.create_items.some((i) => i.type === "list_item")) actions = { ...actions, create_items: actions.create_items.filter((i) => i.type !== "list_item") };
    const appActions = crisis ? [] : actions.app_actions ?? [];
    const aiEvent = brain
      ? event(prisma, user.id, "ai_call", {
          // On the phone: no cost, never counted against the allowance. Counts only, no content.
          purpose: "phone",
          model: (brain.model ?? "phone").slice(0, 64),
          persona: PHONE_REPLY_VERSION,
          valid: modelOk,
          ...(codeReply ? { code_reply: codeReply } : {}),
          items_created: actions.create_items.length,
          items_updated: actions.update_items.length,
          memories_saved: actions.save_memories.length,
          app_actions: appActions.length,
        })
      : usage
      ? event(prisma, user.id, "ai_call", {
          // Calls let through past the allowance don't count against it.
          purpose: freeCall ? "chat_free" : "chat",
          ...(freeCall ? { free: freeCall } : {}),
          model: FRIEND_MODEL,
          persona: PERSONA_VERSION,
          ...(streamMode ? { stream: streamMode } : {}),
          ...(streamLost ? { stream_lost: streamLost } : {}),
          ...usage,
          cost_usd: costUsd(usage),
          items_created: actions.create_items.length,
          items_updated: actions.update_items.length,
          memories_saved: actions.save_memories.length,
          app_actions: appActions.length,
        })
      : null;
    let applied = await applyActions(prisma, { user, message, replies, response: actions, now });
    // The reminder the user just confirmed shows under their message ("Saved: …"), with its time.
    if (shown && !applied.items.some((i) => i.id === shown!.id)) applied = { ...applied, items: [...applied.items, shown] };
    if (appActions.length) {
      const ran = await runAppActions(prisma, user, appActions, script, now, { requireSubscription: requireSubscription ?? false });
      // Nothing the model asked for could be done ("cancel Karim's debt" with no such debt): its
      // words ("I'll cancel it") would be a false promise, so the reply says what happened instead.
      if (ran.cards.length && ran.cards.every((c) => c.status === "failed") && !applied.items.length) {
        // What the phone was shown of the model's words goes first, as with every rewrite.
        live?.onRestart();
        applied = await honestReply(prisma, applied, ran.cards, script);
      }
      applied = await withCards(prisma, applied, ran.cards);
      applied = { ...applied, notices: [...(applied.notices ?? []), ...ran.notices] };
    }
    if (listThings.length) {
      const out = await addToList(prisma, user, script, listThings.map((title) => ({ title, qty: null })), null, now).catch(() => null);
      if (out) applied = { ...(await withCards(prisma, applied, [out.card])), notices: [...(applied.notices ?? []), ...out.notices.filter((n) => n.userId !== user.id)] };
    }
    // A debt with someone in their circles: offer the shared Daftar too (unless the model already did).
    const debts = crisis ? [] : actions.create_items.flatMap((i) => (i.type === "debt" && i.debt && !appActions.some((a) => a.kind === "daftar_add") ? [i.debt] : []));
    if (debts.length) applied = await withCards(prisma, applied, await debtCards(prisma, user, debts, script).catch(() => []));
    // A debt closed in chat that is also in the shared Daftar: offer to settle that entry too.
    const closed = crisis ? [] : applied.items.filter((i) => i.type === "debt" && i.status === "done" && i.debtPerson && actions.update_items.some((u) => u.id === i.id && u.status === "done"));
    if (closed.length && !appActions.some((a) => a.kind === "daftar_settle"))
      applied = await withCards(prisma, applied, await settleCards(prisma, user, closed.map((i) => ({ person: i.debtPerson!, amount: i.debtAmount == null ? null : Number(i.debtAmount) })), script, now).catch(() => []));

    await aiEvent;
    mark("saved");

    // 5. Rolling summary in the background; never blocks the reply.
    // (Not for the phone brain: a summary would be a cloud call, against the point of that mode.)
    if (!brain) void summarizeIfNeeded(prisma, model, user).catch((err) => log?.warn({ err: errorSummary(err) }, "summary failed"));

    return { ...applied, aiAllowance: { limit, used: used + (usage && !freeCall && !brain ? 1 : 0) } };
  };
}

const ARABIC_LETTER = /[\u0600-\u06FF]/;

const UNSET_CHECK =
  "CHECK: your reply says a reminder or alarm is set, but this turn creates or changes no reminder. If the user gave or confirmed a time for something, return it now: update_items with the id from OPEN ITEMS and its time (or create_items if it is not there). If it is already set exactly as they want in OPEN ITEMS, keep your reply and change nothing. If you can't set it, reply without saying it is set.";

/** The turn sets a time for something: a timed reminder or task, a moved one, or a tracker with ask times. */
function setsReminder(a: Pick<FriendResponse, "create_items" | "update_items"> & { app_actions?: FriendResponse["app_actions"] }): boolean {
  return (
    a.create_items.some((i) => (i.type === "reminder" || i.type === "task") && Boolean(i.remind_at_local || i.due_at_local || i.repeat_every_minutes || i.place)) ||
    a.update_items.some((u) => Boolean(u.remind_at_local || u.due_at_local || u.repeat_every_minutes || u.alarm === true || u.place)) ||
    (a.app_actions ?? []).some((x) => x.kind === "create_tracker" || x.kind === "update_tracker")
  );
}

/** A timed reminder or task of the user's set in the last two hours that is still ahead. */
async function recentlySetItem(prisma: Parameters<MessagePipeline>[0]["prisma"], userId: string, now: Date) {
  return prisma.item.findFirst({
    where: {
      userId,
      status: "open",
      type: { in: ["reminder", "task"] },
      updatedAt: { gte: new Date(now.getTime() - 2 * 3600_000) },
      OR: [{ remindAt: { gt: now } }, { dueAt: { gt: now } }, { repeatEveryMinutes: { not: null } }],
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Zaki's status checks (proactive/status.ts) store the subject in the message client_id. When
 * the user's message answers the latest one with a plain yes, mark the item done or log the
 * tracker, with a template reply and no AI call. Otherwise say whether a check is pending.
 */
async function answerStatusCheck(prisma: Parameters<MessagePipeline>[0]["prisma"], user: Parameters<MessagePipeline>[0]["user"], message: Parameters<MessagePipeline>[0]["message"], lastFriend: Message | null, lang: ReplyLang, now: Date): Promise<{ pending: boolean; result?: Awaited<ReturnType<MessagePipeline>> } | null> {
  const pending = pendingStatus(lastFriend, now);
  if (!pending) return null;
  if (!isPlainYes(message.text)) return { pending: true };
  if (pending.kind === "item") {
    const item = await prisma.item.findFirst({ where: { id: pending.id, userId: user.id, status: "open" } });
    if (!item) return { pending: true };
    await event(prisma, user.id, "status_answered", { subject: "item", via: "rules" });
    const result = await applyActions(prisma, { user, message, replies: [statusDoneReply(lang, item)], response: { ...EMPTY_ACTIONS, update_items: [{ id: item.id, status: "done" }] }, now });
    return { pending: true, result };
  }
  const tracker = await prisma.tracker.findFirst({ where: { id: pending.id, userId: user.id } });
  const step = tracker ? TRACKER_TEMPLATES[tracker.kind as TrackerKind]?.step : 0;
  if (!tracker || !step) return { pending: true };
  const { wire } = await logEntryWithStats(prisma, tracker, step, "chat", now, user.timezone);
  await event(prisma, user.id, "status_answered", { subject: "tracker", via: "rules" });
  const line = loggedLine(lang, wire, step);
  return { pending: true, result: await applyActions(prisma, { user, message, replies: [line], response: EMPTY_ACTIONS, now }) };
}

async function event(prisma: Parameters<MessagePipeline>[0]["prisma"], userId: string, name: string, props: Prisma.InputJsonObject) {
  await prisma.event.create({ data: { userId, name, propsJson: props } });
}

/** A counter for the dashboard only (nothing reads it back): written without making the reply wait. */
function counted(prisma: Parameters<MessagePipeline>[0]["prisma"], userId: string, name: string, props: Prisma.InputJsonObject) {
  inBackground(prisma.event.create({ data: { userId, name, propsJson: props } }));
}

/**
 * The chat the model sees, ending with the message being answered. Anything stored after it (a
 * reminder or status line from the tick, or later messages when a retry answers an older one)
 * is left out: it came after what the user wrote, and a history that ends with Zaki's own turn
 * is a prefill, which the API refuses with a 400 (every such turn fell back to "my brain froze").
 */
export function historyUpTo(recent: Pick<Message, "id" | "role" | "text" | "createdAt">[], message: Pick<Message, "id" | "text" | "createdAt">): ChatTurn[] {
  const before = recent.filter((m) => m.id !== message.id && m.createdAt.getTime() <= message.createdAt.getTime());
  return [
    ...before.map((m): ChatTurn => ({ role: m.role === "user" ? "user" : "assistant", text: m.text })),
    { role: "user", text: message.text },
  ];
}

/** A model failure as counted props: HTTP status and a coarse kind read from the API's message. */
export function aiErrorProps(err: unknown): { status: number | null; kind: string } {
  const e = (err ?? {}) as { status?: number; message?: string; name?: string };
  const msg = String(e.message ?? "").toLowerCase();
  const kind = /prefill|final assistant|must end with a user/.test(msg) ? "prefill"
    : /credit balance|billing/.test(msg) ? "credit"
    : /non-empty|must not be empty|empty/.test(msg) ? "empty_text"
    : /surrogate|unicode|utf-?8|invalid json/.test(msg) ? "unicode"
    : /too complex/.test(msg) ? "schema"
    : /timed? ?out|timeout/.test(msg) || e.name === "APIConnectionTimeoutError" ? "timeout"
    : e.status === 429 ? "rate_limit"
    : e.status === 529 || e.status === 503 ? "overloaded"
    : "other";
  return { status: typeof e.status === "number" ? e.status : null, kind };
}

/** Error info that is safe to log (status/type only, never prompt or message text). */
function errorSummary(err: unknown) {
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; code?: string };
    return { name: e.name, status: e.status, code: e.code };
  }
  return { name: "unknown" };
}

const FAILED_TAIL: Record<ReplyLang, string> = {
  arabic: "قولّي تقصد إيه بالظبط وأنا أظبطها.",
  english: "Tell me exactly what you meant and I'll sort it.",
};

/** Replace the turn's replies with one line saying what couldn't be done (card words, not model words). */
async function honestReply<T extends { replies: Message[] }>(prisma: Parameters<MessagePipeline>[0]["prisma"], result: T, cards: StoredCard[], lang: ReplyLang): Promise<T> {
  const [first, ...rest] = result.replies;
  if (!first) return result;
  const text = `${[...new Set(cards.map((c) => c.label))].join(" · ")}. ${FAILED_TAIL[lang]}`;
  const [saved] = await Promise.all([
    prisma.message.update({ where: { id: first.id }, data: { text } }),
    rest.length ? prisma.message.deleteMany({ where: { id: { in: rest.map((m) => m.id) } } }) : null,
  ]);
  return { ...result, replies: [saved] };
}

/** Put action cards on the last reply of a turn (saved, and in the returned replies). */
async function withCards<T extends { replies: Message[] }>(prisma: Parameters<MessagePipeline>[0]["prisma"], result: T, cards: StoredCard[]): Promise<T> {
  const last = result.replies.at(-1);
  if (!cards.length || !last) return result;
  const saved = await attachCards(prisma, last.id, last.actionsJson, cards);
  return { ...result, replies: [...result.replies.slice(0, -1), saved] };
}

/** How long a waiting card can be answered with a plain "yes" in the chat. */
const CARD_ANSWER_WINDOW_MS = 6 * 3600_000;

/**
 * The user's message answers Zaki's latest reply, which has cards waiting for an OK: a plain
 * yes sends them all, a plain no cancels them. Anything else goes on as a normal message.
 */
async function answerPendingCards(prisma: Parameters<MessagePipeline>[0]["prisma"], user: Parameters<MessagePipeline>[0]["user"], message: Parameters<MessagePipeline>[0]["message"], last: Message | null, lang: ReplyLang, now: Date, requireSubscription: boolean): Promise<Awaited<ReturnType<MessagePipeline>> | null> {
  const yes = isConfirm(message.text);
  const no = !yes && isCancel(message.text);
  if (!yes && !no) return null;
  if (!last || now.getTime() - last.createdAt.getTime() > CARD_ANSWER_WINDOW_MS) return null;
  const cards = storedCards(last.actionsJson);
  if (!cards.some((c) => c.status === "pending")) return null;
  const notices: { userId: string; text: string }[] = [];
  const results: StoredCard[] = [];
  // Cards on someone else's news (a request, homework) take "no" as an answer, not a cancel.
  const answers = cards.some((c) => c.status === "pending" && c.noPayload);
  for (const [n, c] of cards.entries()) {
    if (c.status !== "pending") continue;
    const out = await answerCard(prisma, user, c, yes, now, { requireSubscription });
    cards[n] = out.card;
    results.push(out.card);
    notices.push(...out.notices);
  }
  await prisma.message.update({ where: { id: last.id }, data: { actionsJson: cards as unknown as Prisma.InputJsonValue } });
  const reply = answers ? results.map((r) => r.label).join("\n") : yes ? CONFIRMED_REPLY[lang] : CANCELLED_REPLY[lang];
  const applied = await applyActions(prisma, { user, message, replies: [reply], response: EMPTY_ACTIONS, now });
  // The outcome also shows under this reply, with the same card id, so the phone can update
  // the old card it still shows as pending.
  const withResult = await withCards(prisma, applied, results);
  return { ...withResult, notices: [...(withResult.notices ?? []), ...notices] };
}

/**
 * "Undo": the newest done card with an undo, in Zaki's replies of the last day, is taken back
 * (the same as tapping its Undo). Null when there is nothing to undo, so the model answers.
 */
async function undoLatest(prisma: Parameters<MessagePipeline>[0]["prisma"], user: Parameters<MessagePipeline>[0]["user"], message: Parameters<MessagePipeline>[0]["message"], lang: ReplyLang, now: Date): Promise<Awaited<ReturnType<MessagePipeline>> | null> {
  const recent = await prisma.message.findMany({
    where: { userId: user.id, role: "friend", createdAt: { gte: new Date(now.getTime() - UNDO_WINDOW_MS), lte: message.createdAt }, actionsJson: { not: Prisma.AnyNull } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const m of recent) {
    const cards = storedCards(m.actionsJson);
    const at = cards.map((c) => c.status === "done" && Boolean(c.undo)).lastIndexOf(true);
    if (at < 0) continue;
    const out = await undoCard(prisma, user, cards[at]!, m.createdAt, now);
    cards[at] = out;
    await prisma.message.update({ where: { id: m.id }, data: { actionsJson: cards as unknown as Prisma.InputJsonValue } });
    const applied = await applyActions(prisma, { user, message, replies: [out.status === "cancelled" ? LABEL.undone(lang) + " ↩️" : out.label], response: EMPTY_ACTIONS, now });
    return withCards(prisma, applied, [out]);
  }
  return null;
}
