import Constants from "expo-constants";
import {
  HouseList,
  HouseListResponse,
  type CreateListRequest,
  type AddListItemsRequest,
  type UpdateListRequest,
  PocketMoneyResponse,
  HomeworkBatchResponse,
  HomeworkHelpResponse,
  HomeworkCheckResponse,
  type PocketAccount,
  type PocketPaidRequest,
  type HomeworkBatchRequest,
  type HomeworkHelpRequest,
  type HomeworkCheckRequest,
  ReadReceiptResponse,
  type PhotoUpload,
  Message as WireMessage,
  AcceptInviteResponse,
  SessionMessage,
  SessionResponse,
  SessionState,
  type Session,
  type StartSessionRequest,
  ListTrackersResponse,
  TrackerResponse,
  SharedTrackersResponse,
  MoneyOverview,
  PostResponse,
  type CirclePost,
  type ReactionKey,
  SectionResponse,
  SectionDetail,
  MonthGift,
  type MoneySection,
  type CreateSectionRequest,
  type UpdateSectionRequest,
  type AddMoneyEntryRequest,
  type SharedTracker,
  type UpdateTrackerRequest,
  type CreateTrackerRequest,
  type Tracker,
  CircleFeedResponse,
  ListTasksResponse,
  TaskResponse,
  type CircleTask,
  type CreateTaskRequest,
  DaftarResponse,
  ListDaftarResponse,
  type CreateDaftarRequest,
  type DaftarEntry,
  BillingOffersResponse,
  CircleResponse,
  CircleMember,
  CircleInvite,
  CircleSummary,
  CreateInviteResponse,
  InvitePreview,
  ListCirclesResponse,
  type Circle,
  type CircleDetail,
  type CircleKind,
  type CheckinKind,
  type FamilyRole,
  type FamilyType,
  HealthResponse,
  INSTALL_ID_HEADER,
  REPLY_STREAM_HEADER,
  ExportResponse,
  ItemResponse,
  ListItemsResponse,
  ListMemoriesResponse,
  ListMessagesResponse,
  MeResponse,
  type PatchMeRequest,
  type User,
  PostMessageResponse,
  type RegisterDeviceRequest,
  type Item,
  type PatchItemRequest,
  type PostMessageRequest,
  ReferralResponse,
  SplitResponse,
  ListSplitsResponse,
  type SplitInput,
  type UpdateSplitRequest,
  type Split,
  type PostEventsRequest,
} from "@fakkarni/shared";
import { getInstallId } from "@/db/kv";
import { HttpError, isRetryable } from "@/sync/queue";
import { createWriteOutbox, isOffline, QueuedOffline, type PendingWrite } from "@/sync/writes";
import { createStreamSwitch, postForReply, sendForReply, type ReplyHandlers } from "@/sync/stream";
import { openReply } from "@/sync/opener";
import { randomUUID } from "expo-crypto";
import { resolveApiUrl } from "./api-url";
import { accessToken } from "./supabase";
import { isDemo } from "./demo";
import { demoRequest } from "@/demo/server";
import { replayReply } from "@/demo/replay";
import { createScreenCache, eachValid } from "./screen-cache";
import { createSavedReads } from "./saved-reads";
import { cacheRefreshed, dataChanged } from "./signals";
import { overlayDetail, overlayOverview } from "@/money/logic";
import { guessCommentRemoved } from "@/circles/logic";

export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const TIMEOUT_MS = 20_000;
const REPLY_TIMEOUT_MS = 60_000;
/** A copy the server confirmed this recently is used as it is (lib/saved-reads.ts). */
const FRESH_MS = 8_000;
/** Storage writes of saved copies wait this long, so a burst of answers is saved together. */
const SAVE_AFTER_MS = 700;

/** Last good copies of server-only screens (see screen-cache.ts). */
export const screenCache = createScreenCache(
  {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  },
  { later: (save) => void setTimeout(save, SAVE_AFTER_MS) },
);

interface Answer {
  status: number;
  /** The body as text ("" for none). */
  text: string;
  etag: string | null;
}

/** `quiet`: a write that changes nothing a screen shows (analytics, the push token). */
type Init = RequestInit & { quiet?: boolean };

/** One HTTP call as the signed-in user (or this install). Any status is an answer; only no answer throws. */
async function send(path: string, init: Init = {}, timeoutMs = TIMEOUT_MS): Promise<Answer> {
  if (isDemo) {
    try {
      const body = await demoRequest(path, init);
      return { status: body === null || body === undefined ? 204 : 200, text: body === null || body === undefined ? "" : JSON.stringify(body), etag: null };
    } catch (err) {
      return { status: (err as { status?: number }).status ?? 500, text: "", etag: null };
    }
  }
  const { quiet: _quiet, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // The token lookup can stall (Supabase refreshing it): it counts against the same timeout,
    // so a screen shows an error instead of spinning for ever.
    const token = await Promise.race([
      accessToken(),
      new Promise<never>((_, reject) => ctrl.signal.addEventListener("abort", () => reject(new HttpError(0)))),
    ]);
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: rest.signal ?? ctrl.signal,
      headers: {
        // Only with a body: Fastify rejects an empty body sent as JSON.
        ...(rest.body ? { "content-type": "application/json" } : {}),
        [INSTALL_ID_HEADER]: await getInstallId(),
        // Tells the server this build reads the newer message kinds ("upsell", "update").
        "x-message-kinds": "2",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });
    // The server says on its answers whether it sends chat replies while they are written.
    if (res.status < 500) serverStreams(res.headers.get(REPLY_STREAM_HEADER) === "1");
    return { status: res.status, text: res.status === 204 || res.status === 304 ? "" : await res.text(), etag: res.headers.get("etag") };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether a chat reply is asked for as it is written (sync/stream.ts): only from a server that
 * says it sends one. What it last said is kept across app starts, so the first message after a
 * start does not have to wait for another answer to find out.
 */
const STREAM_KEY = "pref:reply_stream";
const replyStream = createStreamSwitch();
let streamKeyRead = false;
function streamSwitch() {
  // Read on first use, not when this file loads: the phone's storage may not be set up by then.
  if (!streamKeyRead) {
    streamKeyRead = true;
    try {
      if (localStorage.getItem(STREAM_KEY) === "1") replyStream.offer(true);
    } catch {
      // No storage here (a test run): the next answer says.
    }
  }
  return replyStream;
}
function serverStreams(yes: boolean): void {
  const sw = streamSwitch();
  if (sw.offered === yes) return;
  sw.offer(yes);
  try {
    localStorage.setItem(STREAM_KEY, yes ? "1" : "0");
  } catch {
    // Kept for this run only.
  }
}

/** Moves when this phone's data is wiped (the account was deleted): see `forgetSaved`. */
let person = 0;

async function request(path: string, init: Init = {}, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  // Anything this phone writes may change what any screen shows: no saved copy is fresh across it.
  const write = (init.method ?? "GET") !== "GET" && !init.quiet;
  const who = person;
  if (write) reads.changed();
  try {
    const res = await send(path, init, timeoutMs);
    // The phone was wiped while this was on its way: the answer is about someone who is no
    // longer here, so it is not handed on (nothing of theirs is saved or drawn again).
    if (who !== person) throw new HttpError(401);
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.status);
    return res.text ? (JSON.parse(res.text) as unknown) : null;
  } finally {
    if (write) reads.changed();
  }
}

const reads = createSavedReads({
  cache: screenCache,
  freshMs: FRESH_MS,
  fetchText: async (path) => {
    const res = await send(path);
    if (res.status !== 200) throw new HttpError(res.status);
    return res.text;
  },
});
// A chat reply, pulled news, a card tap, offline taps sent: ask the server again for everything.
dataChanged.subscribe(() => reads.changed());

/** Signed out or the account deleted: drop every saved copy, and anything still on its way for that person. */
export function forgetSaved(): void {
  person++;
  reads.forget();
  allTag = null;
  allMissingUntil = 0;
}

/**
 * GET through the saved copy: the screen draws the copy at once (`peek`), this brings the
 * server's answer. Callers that overlap share one request, a copy the server confirmed a moment
 * ago is used as it is, and an unchanged answer gives back the very same object (no redraw).
 */
const cachedGet = <T>(path: string, parse: (raw: unknown) => T): Promise<T> => reads.get(path, parse);
const peek = <T>(path: string, parse: (raw: unknown) => T): T | null => reads.peek(path, parse);

/**
 * A write's answer is the newest word on its thing: it goes into the saved copies that show it
 * (`change` returns the copy in the server's own shape), so every screen drawing from its saved
 * copy has it before the next read. Only a copy the phone already holds is touched.
 */
function saved<T>(path: string, parse: (raw: unknown) => T, change: (old: T) => unknown): void {
  try {
    const old = peek(path, parse);
    const next = old === null ? null : change(old);
    if (next !== null && next !== undefined) reads.set(path, next);
  } catch {
    // The saved copy is a convenience: the next read brings the server's answer anyway.
  }
}
/** `next` in the place of the entry with its id in a saved list (a list that does not hold it is left alone). */
function savedIn<T, E extends { id: string }>(path: string, parse: (raw: unknown) => T, list: (old: T) => E[], back: (old: T, list: E[]) => unknown, next: E): void {
  saved(path, parse, (old) => (list(old).some((x) => x.id === next.id) ? back(old, list(old).map((x) => (x.id === next.id ? next : x))) : null));
}

/** Shared-data taps made offline wait here (localStorage) and go out on the next refresh, once each. */
const WRITES_KEY = "pending_writes";
export const writeOutbox = createWriteOutbox({
  store: {
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(WRITES_KEY) ?? "[]") as PendingWrite[];
      } catch {
        return [];
      }
    },
    save: (w) => localStorage.setItem(WRITES_KEY, JSON.stringify(w)),
  },
  send: async (w) => {
    await request(w.path, { method: w.method, ...(w.body === undefined ? {} : { body: JSON.stringify(w.body) }), headers: { "x-idempotency-key": w.id } });
  },
});

/**
 * A write to shared data that may wait on the phone: tried now (with its key); with no
 * connection it is kept and QueuedOffline is thrown, so the screen keeps what it showed.
 */
async function writeOrQueue(method: PendingWrite["method"], path: string, body?: unknown, opts: { alsoOnServerError?: boolean; timeoutMs?: number } = {}): Promise<unknown> {
  const w: PendingWrite = { id: randomUUID(), method, path, body, at: new Date().toISOString() };
  try {
    return await request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "x-idempotency-key": w.id } }, opts.timeoutMs);
  } catch (err) {
    // Writes that carry their own id are safe to resend after a server hiccup (a deploy restarting
    // it, busy): the server knows the id and never applies them twice.
    const keep = isOffline(err) || (opts.alsoOnServerError === true && isRetryable(err) && !(err instanceof HttpError && err.status === 409));
    if (!keep || isDemo) throw err;
    writeOutbox.enqueue(w);
    throw new QueuedOffline();
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  if (!res.ok) throw new HttpError(res.status);
  return HealthResponse.parse(await res.json());
}

export async function postMessage(body: PostMessageRequest): Promise<PostMessageResponse> {
  return PostMessageResponse.parse(await postMessageRaw(body));
}

/**
 * POST /messages, unparsed: with the phone brain on, the server may answer 202 (NeedsBrainResponse).
 * With `live`, and a server that says it sends replies while they are written, the reply is
 * asked for as a stream: its words are handed on while Zaki writes them, and the returned
 * answer is the same one a plain POST gives. Every other send is the plain POST it always was,
 * and so is the second try of a streamed send that got no answer (`sendForReply`).
 */
export async function postMessageRaw(body: PostMessageRequest, live?: ReplyHandlers): Promise<unknown> {
  // Zaki's reply is an AI call: give it longer than a screen load, or a slow reply is cut off,
  // retried, and the message sits there looking unsent.
  const text = JSON.stringify(body);
  const plain = () => request("/messages", { method: "POST", body: text }, REPLY_TIMEOUT_MS);
  // Not when the phone's own model writes the reply.
  if (!live || isDemo || body.brain === "phone") {
    const answer = await plain();
    // The sample data has no server to stream from: its answer is shown as a stream would show it.
    if (live && isDemo) await replayReply(answer, live);
    return answer;
  }

  const who = person;
  return sendForReply({
    switch: streamSwitch(),
    now: Date.now,
    limitMs: REPLY_TIMEOUT_MS,
    plain,
    // Words for someone who is no longer on this phone (it was wiped meanwhile) are not drawn.
    onGiveUp: () => (who === person ? live.onReset() : undefined),
    stream: async () => {
      const started = Date.now();
      reads.changed();
      try {
        // As in `send`: the sign-in lookup counts against the same wait.
        let giveUp: ReturnType<typeof setTimeout> | undefined;
        const token = await Promise.race([accessToken(), new Promise<never>((_, reject) => (giveUp = setTimeout(() => reject(new HttpError(0)), REPLY_TIMEOUT_MS)))]).finally(() => clearTimeout(giveUp));
        const answer = await postForReply(
          openReply,
          {
            url: `${API_URL}/messages`,
            headers: { "content-type": "application/json", [INSTALL_ID_HEADER]: await getInstallId(), "x-message-kinds": "2", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: text,
            timeoutMs: Math.max(1_000, REPLY_TIMEOUT_MS - (Date.now() - started)),
          },
          {
            onDraft: (bubble, delta) => (who === person ? live.onDraft(bubble, delta) : undefined),
            onReset: () => (who === person ? live.onReset() : undefined),
          },
        );
        if (who !== person) throw new HttpError(401);
        return answer;
      } finally {
        reads.changed();
      }
    },
  });
}

/** Answer one of Zaki's action cards (Send / Cancel). Returns the reply with its cards updated. */
/** Confirm or cancel a pending card, or "undo" a done one (the user's own change, within a day). */
export async function actOnChatAction(messageId: string, actionId: string, answer: boolean | "undo"): Promise<WireMessage> {
  const body = answer === "undo" ? { undo: true } : { confirm: answer };
  const res = (await request(`/messages/${encodeURIComponent(messageId)}/actions/${encodeURIComponent(actionId)}`, { method: "POST", body: JSON.stringify(body) })) as { message: unknown };
  return WireMessage.parse(res.message);
}

export async function patchItem(id: string, body: PatchItemRequest): Promise<Item> {
  return ItemResponse.parse(await request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(body) })).item;
}

/** Mark an item done. With no connection it is kept on the phone (QueuedOffline) and sent later. */
export async function completeItem(id: string): Promise<Item> {
  return ItemResponse.parse(await writeOrQueue("PATCH", `/items/${id}`, { status: "done" })).item;
}

export async function deleteMemory(id: string): Promise<void> {
  await request(`/memories/${id}`, { method: "DELETE" });
}

export async function listMessagesAfter(after: string | null): Promise<ListMessagesResponse> {
  const q = after ? `?after=${encodeURIComponent(after)}` : "";
  return ListMessagesResponse.parse(await request(`/messages${q}`));
}

export async function registerDevice(body: RegisterDeviceRequest): Promise<void> {
  await request("/devices", { method: "POST", body: JSON.stringify(body), quiet: true });
}

export async function unregisterDevice(pushToken: string): Promise<void> {
  await request("/devices", { method: "DELETE", body: JSON.stringify({ push_token: pushToken }), quiet: true });
}

export async function listMessagesPage(after: string | null, limit = 200): Promise<ListMessagesResponse> {
  const q = new URLSearchParams({ limit: String(limit), ...(after ? { after } : {}) });
  return ListMessagesResponse.parse(await request(`/messages?${q}`));
}

export async function listItems(status?: "open" | "done" | "cancelled") {
  return ListItemsResponse.parse(await request(`/items${status ? `?status=${status}` : ""}`)).items;
}

// A server from before cities omits `city` (zod fills null): the City row and Zaki's question wait
// for a profile that carries the key, so an update that reaches phones first offers nothing it
// can't save.
let cityKnown = false;
export const serverKnowsCity = () => cityKnown;
const parseMe = (raw: unknown) => {
  const user = MeResponse.parse(raw).user;
  const sent = (raw as { user?: Record<string, unknown> } | null)?.user;
  if (sent && "city" in sent) cityKnown = true;
  return user;
};
export async function getMe(): Promise<User> {
  return cachedGet("/me", parseMe);
}
/** The last profile seen, so Me shows the real choices at once instead of defaults. */
export const peekMe = () => peek("/me", parseMe);

export async function patchMe(body: PatchMeRequest): Promise<User> {
  const raw = await request("/me", { method: "PATCH", body: JSON.stringify(body) });
  const user = parseMe(raw);
  reads.set("/me", raw);
  return user;
}

/** After sign-in: attach what this phone captured before signing in to the account. */
export async function linkAccount(): Promise<User> {
  return MeResponse.parse(await request("/auth/link", { method: "POST" })).user;
}

export async function exportData(): Promise<ExportResponse> {
  return ExportResponse.parse(await request("/me/export"));
}

export async function deleteAccount(): Promise<void> {
  await request("/me", { method: "DELETE" });
}

const parseMemories = (raw: unknown) => ListMemoriesResponse.parse(raw).memories;
export async function listMemories() {
  return cachedGet("/memories", parseMemories);
}
export const peekMemories = () => peek("/memories", parseMemories);

/** Ask the server to re-read the RevenueCat entitlement (right after a purchase or restore). */
export async function refreshPlan(): Promise<User> {
  return MeResponse.parse(await request("/me/plan/refresh", { method: "POST" })).user;
}

export async function getBillingOffers(): Promise<BillingOffersResponse> {
  return BillingOffersResponse.parse(await request("/billing/offers"));
}

// Circles (Friends and Family spaces). These need a connection: they are shared records.
const parseCircles = (raw: unknown): Circle[] => eachValid(ListCirclesResponse.shape.circles.element.safeParse, (raw as { circles?: unknown } | null)?.circles);
export async function listCircles(): Promise<Circle[]> {
  return cachedGet("/circles", parseCircles);
}
export const peekCircles = () => peek("/circles", parseCircles);

export async function createCircle(kind: CircleKind, name: string, familyType?: FamilyType | null): Promise<CircleDetail> {
  return CircleResponse.parse(await request("/circles", { method: "POST", body: JSON.stringify({ kind, name, ...(familyType ? { family_type: familyType } : {}) }) })).circle;
}

/** A member's place in the family (your own, or anyone's when you own the circle). */
export async function setFamilyRole(circleId: string, userId: string, role: FamilyRole | null): Promise<CircleDetail> {
  return savedCircle(await request(`/circles/${circleId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ family_role: role }) }));
}

/** One-tap check-in, shared with the circle. `note`: a few words ("المدرسة" for "arrived at school"), never a location. */
export async function checkIn(circleId: string, kind: CheckinKind, note?: string): Promise<CircleDetail> {
  return savedCircle(await writeOrQueue("POST", `/circles/${circleId}/checkins`, note ? { kind, note: note.slice(0, 80) } : { kind }));
}

/**
 * The household lists a shop of this kind shows when the phone arrives there (place reminders):
 * read from the saved copy of GET /lists, loosely, so the phone works before and after the lists
 * feature reaches it. Empty when there is no saved copy.
 */
export function peekShopLists(kind: string): { id: string; name: string; open_count: number }[] {
  const parsed = peek("/lists", (raw) => {
    const lists = (raw as { lists?: unknown } | null)?.lists;
    return Array.isArray(lists) ? lists : [];
  });
  return (parsed ?? []).flatMap((l) => {
    const o = l as { id?: unknown; name?: unknown; place?: unknown; open_count?: unknown };
    return typeof o.id === "string" && typeof o.name === "string" && o.place === kind && typeof o.open_count === "number" ? [{ id: o.id, name: o.name, open_count: o.open_count }] : [];
  });
}
/** A circle as a write answered it: also the saved copy the circle screen opens from. */
function savedCircle(raw: unknown): CircleDetail {
  const circle = CircleResponse.parse(raw).circle;
  reads.set(`/circles/${circle.id}`, raw);
  return circle;
}
/** The circle as the phone guesses it after a check-in that waits for a connection. */
export const saveCircle = (circle: CircleDetail) => reads.set(`/circles/${circle.id}`, { circle });

/** Zaki asks a member to check in. Throws HttpError 409 when asked too recently. */
export async function askCheckin(circleId: string, userId: string): Promise<void> {
  await request(`/circles/${circleId}/members/${userId}/ask-checkin`, { method: "POST" });
}

/** Zaki's weekly summary (an extra: 402 after the circle's trial without Pro). */
export async function getCircleSummary(id: string): Promise<CircleSummary> {
  return CircleSummary.parse(await request(`/circles/${id}/summary`));
}

/** The circle itself must parse; a member or invite row that doesn't is left out rather than blanking the screen. */
const parseCircle = (raw: unknown): CircleDetail => {
  const c = (raw as { circle?: Record<string, unknown> } | null)?.circle ?? {};
  return CircleResponse.shape.circle.parse({ ...c, members: eachValid(CircleMember.safeParse, c.members), open_invites: eachValid(CircleInvite.safeParse, c.open_invites) });
};
export async function getCircle(id: string): Promise<CircleDetail> {
  return cachedGet(`/circles/${id}`, parseCircle);
}
export const peekCircle = (id: string) => peek(`/circles/${id}`, parseCircle);

export async function deleteCircle(id: string): Promise<void> {
  await request(`/circles/${id}`, { method: "DELETE" });
}

/** Remove a member, or leave when `userId` is your own. */
export async function removeCircleMember(id: string, userId: string): Promise<void> {
  await request(`/circles/${id}/members/${userId}`, { method: "DELETE" });
}

export async function createInvite(circleId: string): Promise<CreateInviteResponse> {
  return CreateInviteResponse.parse(await request(`/circles/${circleId}/invites`, { method: "POST" }));
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  return InvitePreview.parse(await request(`/invites/${encodeURIComponent(code)}`));
}

export async function acceptInvite(code: string): Promise<CircleDetail> {
  return AcceptInviteResponse.parse(await request(`/invites/${encodeURIComponent(code)}/accept`, { method: "POST" })).circle;
}

// Shared Daftar: debts both people see. Needs a connection.
const parseDaftar = (raw: unknown): DaftarEntry[] => eachValid(ListDaftarResponse.shape.entries.element.safeParse, (raw as { entries?: unknown } | null)?.entries);
export async function listDaftar(): Promise<DaftarEntry[]> {
  return cachedGet("/daftar", parseDaftar);
}
export const peekDaftar = () => peek("/daftar", parseDaftar);

export async function createDaftar(body: CreateDaftarRequest): Promise<DaftarResponse> {
  return DaftarResponse.parse(await request("/daftar", { method: "POST", body: JSON.stringify(body) }));
}

/** The WhatsApp message to send now: the confirm link, or a kind nudge once confirmed. */
export async function daftarShareText(id: string): Promise<string | null> {
  return DaftarResponse.parse(await request(`/daftar/${id}/share`, { method: "POST" })).share_text;
}

export async function openDaftar(code: string): Promise<DaftarEntry> {
  return DaftarResponse.parse(await request(`/daftar/open/${encodeURIComponent(code)}`, { method: "POST" })).entry;
}

const savedEntry = (entry: DaftarEntry): DaftarEntry => {
  savedIn("/daftar", parseDaftar, (entries) => entries, (_, entries) => ({ entries }), entry);
  return entry;
};
export async function respondDaftar(id: string, answer: "confirm" | "dispute"): Promise<DaftarEntry> {
  return savedEntry(DaftarResponse.parse(await request(`/daftar/${id}/respond`, { method: "POST", body: JSON.stringify({ answer }) })).entry);
}

export async function settleDaftar(id: string): Promise<DaftarEntry> {
  return savedEntry(DaftarResponse.parse(await request(`/daftar/${id}/settle`, { method: "POST" })).entry);
}

export async function cancelDaftar(id: string): Promise<void> {
  await request(`/daftar/${id}/cancel`, { method: "POST" });
}

// Assigned tasks: ask someone in a circle; they accept first. Needs a connection.
const parseTasks = (raw: unknown): CircleTask[] => eachValid(ListTasksResponse.shape.tasks.element.safeParse, (raw as { tasks?: unknown } | null)?.tasks);
export async function listTasks(): Promise<CircleTask[]> {
  return cachedGet("/tasks", parseTasks);
}
export const peekTasks = () => peek("/tasks", parseTasks);

const parseFeed = (raw: unknown): CircleFeedResponse => {
  const r = (raw ?? {}) as { posts?: unknown; tasks?: unknown };
  return { posts: eachValid(CircleFeedResponse.shape.posts.element.safeParse, r.posts), tasks: eachValid(CircleFeedResponse.shape.tasks.element.safeParse, r.tasks) };
};
export async function getCircleFeed(circleId: string): Promise<CircleFeedResponse> {
  return cachedGet(`/circles/${circleId}/feed`, parseFeed);
}
export const peekCircleFeed = (circleId: string) => peek(`/circles/${circleId}/feed`, parseFeed);

// The circle feed: reactions, short comments, and asking Zaki in front of the circle.
const savedPost = (circleId: string, post: CirclePost): CirclePost => {
  saved(`/circles/${circleId}/feed`, parseFeed, (feed) => ({ ...feed, posts: feed.posts.some((p) => p.id === post.id) ? feed.posts.map((p) => (p.id === post.id ? post : p)) : [post, ...feed.posts] }));
  return post;
};
export async function reactPost(circleId: string, postId: string, key: ReactionKey | null): Promise<CirclePost> {
  return savedPost(circleId, PostResponse.parse(await request(`/circles/${circleId}/posts/${postId}/react`, { method: "POST", body: JSON.stringify({ key }) })).post);
}
export async function commentPost(circleId: string, postId: string, text: string): Promise<CirclePost> {
  return savedPost(circleId, PostResponse.parse(await request(`/circles/${circleId}/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text }) })).post);
}
export async function deleteComment(circleId: string, commentId: string): Promise<void> {
  await request(`/circles/${circleId}/comments/${commentId}`, { method: "DELETE" });
  // Answered with nothing to save: take it out of the saved feed here, or the next draw from
  // that copy brings the comment back.
  saved(`/circles/${circleId}/feed`, parseFeed, (feed) => ({ ...feed, posts: feed.posts.map((p) => guessCommentRemoved(p, commentId)) }));
}
export async function askZakiInCircle(circleId: string, text: string): Promise<CirclePost> {
  return savedPost(circleId, PostResponse.parse(await request(`/circles/${circleId}/zaki`, { method: "POST", body: JSON.stringify({ text }) })).post);
}

export async function createTask(circleId: string, body: CreateTaskRequest): Promise<CircleTask> {
  return TaskResponse.parse(await request(`/circles/${circleId}/tasks`, { method: "POST", body: JSON.stringify(body) })).task;
}

/** A task as a write answered it: also in the saved lists (all tasks, its circle's feed). */
function savedTask(raw: unknown): CircleTask {
  const task = TaskResponse.parse(raw).task;
  savedIn("/tasks", parseTasks, (tasks) => tasks, (_, tasks) => ({ tasks }), task);
  savedIn(`/circles/${task.circle_id}/feed`, parseFeed, (feed) => feed.tasks, (feed, tasks) => ({ ...feed, tasks }), task);
  return task;
}
export async function respondTask(id: string, answer: "accept" | "decline"): Promise<CircleTask> {
  return savedTask(await request(`/tasks/${id}/respond`, { method: "POST", body: JSON.stringify({ answer }) }));
}

const taskAction = (verb: "done" | "cancel" | "nudge") => async (id: string): Promise<CircleTask> => savedTask(await request(`/tasks/${id}/${verb}`, { method: "POST" }));
export const finishTask = taskAction("done");
export const cancelTask = taskAction("cancel");
export const nudgeTask = taskAction("nudge");
/** A slow call (photos): its own 60-second limit instead of the usual one. */
function slow(): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 60_000);
  return ctrl.signal;
}

/** Homework: the child hands in an answer, a link or page photos; the parent says well done or redo. */
export async function submitHomework(id: string, text: string, photos: PhotoUpload[] = []): Promise<CircleTask> {
  return savedTask(await request(`/tasks/${id}/submit`, { method: "POST", body: JSON.stringify({ text, photos }), ...(photos.length ? { signal: slow() } : {}) }));
}

/** The AI reads a receipt photo (counts as one AI message; the photo is not kept). */
export async function readReceipt(photo: PhotoUpload): Promise<ReadReceiptResponse> {
  return ReadReceiptResponse.parse(await request("/receipts/read", { method: "POST", body: JSON.stringify({ photo }), signal: slow() }));
}

/** An image source for a homework page: the server checks it's the child's or the parent's. */
export async function photoSource(id: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await accessToken();
  return { uri: `${API_URL}/photos/${id}`, headers: { [INSTALL_ID_HEADER]: await getInstallId(), ...(token ? { authorization: `Bearer ${token}` } : {}) } };
}
export async function reviewHomework(id: string, verdict: "approved" | "redo", note?: string): Promise<CircleTask> {
  return savedTask(await request(`/tasks/${id}/review`, { method: "POST", body: JSON.stringify({ verdict, ...(note ? { note } : {}) }) }));
}
// Homework, grown up (2026-11-26): pocket money, a week at once, and Zaki helping.
const parsePocket = (raw: unknown): PocketAccount[] => eachValid(PocketMoneyResponse.shape.accounts.element.safeParse, (raw as { accounts?: unknown } | null)?.accounts);
export async function getPocketMoney(): Promise<PocketAccount[]> {
  return cachedGet("/pocket-money", parsePocket);
}
export const peekPocketMoney = () => peek("/pocket-money", parsePocket);
/** The parent marks pocket money as handed over; the answer is every record, fresh. */
export async function markPocketPaid(body: PocketPaidRequest): Promise<PocketAccount[]> {
  const raw = await request("/pocket-money/paid", { method: "POST", body: JSON.stringify(body) });
  saved("/pocket-money", parsePocket, () => raw);
  return parsePocket(raw);
}
/** A week's homework for one child in one go. */
export async function sendHomeworkBatch(circleId: string, body: HomeworkBatchRequest): Promise<CircleTask[]> {
  const { tasks } = HomeworkBatchResponse.parse(await request(`/circles/${circleId}/homework`, { method: "POST", body: JSON.stringify(body) }));
  saved("/tasks", parseTasks, (old) => ({ tasks: [...tasks, ...old] }));
  return tasks;
}
/** Zaki explains a lesson to the parent (one AI message; words and photos are not kept). */
export async function homeworkHelp(body: HomeworkHelpRequest): Promise<HomeworkHelpResponse> {
  return HomeworkHelpResponse.parse(await request("/homework/help", { method: "POST", body: JSON.stringify(body), signal: slow() }));
}
/** Zaki gives the child hints on their answers, never the answers. */
export async function checkHomework(id: string, body: HomeworkCheckRequest): Promise<HomeworkCheckResponse> {
  return HomeworkCheckResponse.parse(await request(`/tasks/${id}/check`, { method: "POST", body: JSON.stringify(body), signal: slow() }));
}

export async function remindTask(id: string, remind_at: string | null): Promise<CircleTask> {
  return savedTask(await request(`/tasks/${id}/remind`, { method: "POST", body: JSON.stringify({ remind_at }) }));
}

// Trackers dashboard. Needs a connection; chat messages feed it on the server too.
export async function listTrackers(): Promise<ListTrackersResponse> {
  return cachedGet("/trackers", ListTrackersResponse.parse);
}
export const peekTrackers = () => peek("/trackers", ListTrackersResponse.parse);

export async function createTracker(body: CreateTrackerRequest): Promise<Tracker> {
  return TrackerResponse.parse(await request("/trackers", { method: "POST", body: JSON.stringify(body) })).tracker;
}

/** One tap (no amount) adds the template's step; money trackers send the amount. */
export async function updateTracker(id: string, body: UpdateTrackerRequest): Promise<Tracker> {
  return saveTracker(TrackerResponse.parse(await request(`/trackers/${id}`, { method: "PATCH", body: JSON.stringify(body) })).tracker);
}
/**
 * A tracker as a write answered it, or as the phone guesses it after a step that waits for a
 * connection: also in the saved list, so Today and the trackers page agree at once.
 */
export function saveTracker(tracker: Tracker): Tracker {
  savedIn("/trackers", ListTrackersResponse.parse, (all) => all.trackers, (all, trackers) => ({ ...all, trackers }), tracker);
  return tracker;
}

const parseShared = (raw: unknown): SharedTracker[] => eachValid(SharedTrackersResponse.shape.trackers.element.safeParse, (raw as { trackers?: unknown } | null)?.trackers);
export async function getCircleTrackers(circleId: string): Promise<SharedTracker[]> {
  return cachedGet(`/circles/${circleId}/trackers`, parseShared);
}
export const peekCircleTrackers = (circleId: string) => peek(`/circles/${circleId}/trackers`, parseShared);

export async function logTracker(id: string, amount?: number): Promise<Tracker> {
  // Carries the tap's time, so a step that waited offline counts for the day it was logged.
  const at = new Date().toISOString();
  return saveTracker(TrackerResponse.parse(await writeOrQueue("POST", `/trackers/${id}/entries`, amount === undefined ? { at } : { amount, at })).tracker);
}

export async function undoTracker(id: string): Promise<Tracker> {
  return saveTracker(TrackerResponse.parse(await request(`/trackers/${id}/undo`, { method: "POST" })).tracker);
}

export async function deleteTracker(id: string): Promise<void> {
  await request(`/trackers/${id}`, { method: "DELETE" });
}

// Session: a private space to reflect. Online only; nothing is kept on the phone.
export async function getSessionState(): Promise<SessionState> {
  return SessionState.parse(await request("/session"));
}

export async function consentToSession(): Promise<void> {
  await request("/session/consent", { method: "POST", body: JSON.stringify({ adult: true, agree: true }) });
}

/** Throws HttpError 402 when the free session of the week is used. */
export async function startSession(body: StartSessionRequest): Promise<Session> {
  return SessionResponse.parse(await request("/session/start", { method: "POST", body: JSON.stringify(body) })).session;
}

export async function sendSessionMessage(id: string, text: string): Promise<{ messages: SessionMessage[]; ended: boolean }> {
  const res = (await request(`/session/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) })) as { messages?: unknown; ended?: unknown };
  return { messages: SessionMessage.array().parse(res.messages), ended: res.ended === true };
}

export async function endSession(id: string): Promise<Session> {
  return SessionResponse.parse(await request(`/session/${id}/end`, { method: "POST" })).session;
}

export async function acceptSessionStep(messageId: string): Promise<void> {
  await request(`/session/steps/${messageId}/remind`, { method: "POST" });
}

export async function deleteSessionData(): Promise<void> {
  await request("/session", { method: "DELETE" });
}

// Ramadan pack: free seasonal trackers and iftar invitations.
export async function addRamadanPack(): Promise<void> {
  await request("/trackers/ramadan-pack", { method: "POST" });
}

/** `on` is a calendar day, "YYYY-MM-DD". */
export async function inviteToIftar(circleId: string, on: string): Promise<void> {
  await request(`/circles/${circleId}/iftar`, { method: "POST", body: JSON.stringify({ on }) });
}

export async function answerInvite(circleId: string, postId: string, going: boolean): Promise<void> {
  await request(`/circles/${circleId}/posts/${postId}/rsvp`, { method: "POST", body: JSON.stringify({ going }) });
  // The answer carries no post: the saved feed gets the user's answer here, so the screen's
  // next draw from that copy doesn't flip the chip back.
  saved(`/circles/${circleId}/feed`, parseFeed, (feed) => ({ ...feed, posts: feed.posts.map((p) => (p.id === postId ? { ...p, my_rsvp: going } : p)) }));
}

// Wider Daftar: expense / income sections and circle shared books. Local-first (2026-11-25):
// the screens draw from the saved copy plus what waits on the phone, and every write carries an
// id made here, so it shows at once and is sent (or resent) in the background.
const MONEY_PATH = "/money";
/**
 * Money writes on their way right now (not yet answered). With the outbox (writes waiting for a
 * connection) they are laid over the server's copy, so the screen never loses what was just typed.
 */
const moneyInflight = new Map<string, PendingWrite>();
const waitingMoney = (): PendingWrite[] => {
  const seen = new Set<string>();
  return [...writeOutbox.pending(), ...moneyInflight.values()].filter((w) => {
    const k = `${w.method} ${w.path} ${(w.body as { id?: string } | undefined)?.id ?? ""}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
};
async function moneyWrite(method: PendingWrite["method"], path: string, body?: { id?: string }): Promise<unknown> {
  const key = `${method} ${path} ${body?.id ?? ""}`;
  moneyInflight.set(key, { id: key, method, path, body, at: new Date().toISOString() });
  try {
    return await writeOrQueue(method, path, body, { alsoOnServerError: true });
  } finally {
    moneyInflight.delete(key);
  }
}

export async function getMoney(): Promise<MoneyOverview> {
  const fresh = await cachedGet(MONEY_PATH, MoneyOverview.parse);
  return overlayOverview(fresh, waitingMoney());
}
/** The saved overview (the server's last answer, kept in step with answered writes) plus what waits. */
export const peekMoney = (): MoneyOverview | null => {
  const o = peekMoneySaved();
  return o ? overlayOverview(o, waitingMoney()) : null;
};
export const peekMoneySaved = () => peek(MONEY_PATH, MoneyOverview.parse);
export const saveMoney = (o: MoneyOverview) => reads.set(MONEY_PATH, o);
const sectionPath = (id: string) => `/money/sections/${id}`;
export async function getSection(id: string): Promise<SectionDetail> {
  return overlayDetail(await cachedGet(sectionPath(id), SectionDetail.parse), waitingMoney());
}
export const peekSection = (id: string): SectionDetail | null => {
  const d = peekSectionSaved(id);
  return d ? overlayDetail(d, waitingMoney()) : null;
};
export const peekSectionSaved = (id: string) => peek(sectionPath(id), SectionDetail.parse);
export const saveSection = (d: SectionDetail) => reads.set(sectionPath(d.section.id), d);
export const forgetSection = (id: string) => screenCache.remove(sectionPath(id));

/** Make a section with an id made on the phone. Throws QueuedOffline when it waits for a connection. */
export async function createSection(body: CreateSectionRequest & { id: string }): Promise<MoneySection> {
  return SectionResponse.parse(await moneyWrite("POST", "/money/sections", body)).section;
}
export async function updateSection(id: string, body: UpdateSectionRequest): Promise<MoneySection> {
  return SectionResponse.parse(await request(sectionPath(id), { method: "PATCH", body: JSON.stringify(body) })).section;
}
export async function deleteSection(id: string): Promise<void> {
  await request(sectionPath(id), { method: "DELETE" });
}
export async function addMoney(id: string, body: AddMoneyEntryRequest & { id: string }): Promise<SectionResponse> {
  return SectionResponse.parse(await moneyWrite("POST", `${sectionPath(id)}/entries`, body));
}
/** Put an add straight in the outbox, behind a section create that is waiting there itself. */
export function queueAddMoney(id: string, body: AddMoneyEntryRequest & { id: string }): void {
  writeOutbox.enqueue({ id: randomUUID(), method: "POST", path: `${sectionPath(id)}/entries`, body, at: new Date().toISOString() });
}
export async function deleteMoneyEntry(id: string): Promise<void> {
  await moneyWrite("DELETE", `/money/entries/${id}`);
}
export async function getMonthGift(): Promise<MonthGift> {
  return MonthGift.parse(await request("/money/gift"));
}

// Invite rewards: a personal link; the friend and the inviter both get Pro days.
export async function getReferral(): Promise<ReferralResponse> {
  return ReferralResponse.parse(await request("/me/referral"));
}

export async function claimReferral(code: string): Promise<User> {
  return MeResponse.parse(await request("/referrals/claim", { method: "POST", body: JSON.stringify({ code }) })).user;
}

/** Product analytics: counted events, never content (src/lib/analytics.ts). */
export async function postEvents(body: PostEventsRequest): Promise<void> {
  await request("/events", { method: "POST", body: JSON.stringify(body), quiet: true });
}

// Split the check: needs a connection (the page everyone opens lives on the server).
export async function createSplit(body: SplitInput): Promise<SplitResponse> {
  return SplitResponse.parse(await request("/splits", { method: "POST", body: JSON.stringify(body) }));
}
const parseSplits = (raw: unknown): Split[] => eachValid(ListSplitsResponse.shape.splits.element.safeParse, (raw as { splits?: unknown } | null)?.splits);
export async function listSplits(): Promise<Split[]> {
  return cachedGet("/splits", parseSplits);
}
export const peekSplits = () => peek("/splits", parseSplits);
export async function getSplit(id: string): Promise<SplitResponse> {
  return cachedGet(`/splits/${id}`, SplitResponse.parse);
}
export const peekSplit = (id: string) => peek(`/splits/${id}`, SplitResponse.parse);
export async function updateSplit(id: string, body: UpdateSplitRequest): Promise<SplitResponse> {
  return SplitResponse.parse(await request(`/splits/${id}`, { method: "PUT", body: JSON.stringify(body) }));
}
export async function markSplitPaid(id: string, index: number, paid: boolean): Promise<SplitResponse> {
  return SplitResponse.parse(await request(`/splits/${id}/paid`, { method: "POST", body: JSON.stringify({ index, paid }) }));
}
export async function deleteSplit(id: string): Promise<void> {
  await request(`/splits/${id}`, { method: "DELETE" });
}

// Shared household lists (2026-11-26). Adds and ticks carry phone-made ids or are idempotent, so
// they go through writeOrQueue: offline they wait on the phone and the screen keeps its guess.
const parseLists = (raw: unknown): HouseList[] => eachValid(HouseList.safeParse, (raw as { lists?: unknown } | null)?.lists);
export async function listLists(): Promise<HouseList[]> {
  return cachedGet("/lists", parseLists);
}
export const peekLists = (): HouseList[] | null => peek("/lists", parseLists);
/** A list as the server (or a guess) has it, into the saved copy of every list. */
export function savedList(list: HouseList): HouseList {
  saved("/lists", parseLists, (old) => ({ lists: old.some((l) => l.id === list.id) ? old.map((l) => (l.id === list.id ? list : l)) : [list, ...old] }));
  return list;
}
const listAnswer = (raw: unknown): HouseList => savedList(HouseListResponse.parse(raw).list);
export async function createList(body: CreateListRequest): Promise<HouseList> {
  return listAnswer(await request("/lists", { method: "POST", body: JSON.stringify(body) }));
}
export async function updateList(id: string, body: UpdateListRequest): Promise<HouseList> {
  return listAnswer(await request(`/lists/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteList(id: string): Promise<void> {
  await request(`/lists/${id}`, { method: "DELETE" });
  saved("/lists", parseLists, (old) => ({ lists: old.filter((l) => l.id !== id) }));
}
export async function addListItems(id: string, body: AddListItemsRequest): Promise<HouseList> {
  return listAnswer(await writeOrQueue("POST", `/lists/${id}/items`, body, { alsoOnServerError: true }));
}
export async function setListItemDone(id: string, itemId: string, done: boolean): Promise<HouseList> {
  return listAnswer(await writeOrQueue("PATCH", `/lists/${id}/items/${itemId}`, { done }, { alsoOnServerError: true }));
}
export async function removeListItem(id: string, itemId: string): Promise<HouseList> {
  return listAnswer(await writeOrQueue("DELETE", `/lists/${id}/items/${itemId}`));
}
export async function clearListDone(id: string): Promise<HouseList> {
  return listAnswer(await writeOrQueue("POST", `/lists/${id}/clear`));
}
/** "I'm going shopping" tells other people: only shown as done once the server says so. */
export async function setListTrip(id: string, going: boolean): Promise<HouseList> {
  return listAnswer(await request(`/lists/${id}/trip`, { method: "POST", body: JSON.stringify({ going }) }));
}

// Every tab in one answer (GET /bootstrap, servers from 2026-11-26). The server runs each screen's
// own GET as this caller and returns their texts together; each is checked with its screen's
// parser here, exactly like a single answer, before it replaces a saved copy.
const PARSERS: [RegExp, (raw: unknown) => unknown][] = [
  [/^\/me$/, parseMe],
  [/^\/circles$/, parseCircles],
  [/^\/tasks$/, parseTasks],
  [/^\/trackers$/, ListTrackersResponse.parse],
  [/^\/daftar$/, parseDaftar],
  [/^\/money$/, MoneyOverview.parse],
  [/^\/splits$/, parseSplits],
  [/^\/memories$/, parseMemories],
  [/^\/pocket-money$/, parsePocket],
  [/^\/lists$/, parseLists],
  [/^\/circles\/[^/]+$/, parseCircle],
  [/^\/circles\/[^/]+\/feed$/, parseFeed],
  [/^\/circles\/[^/]+\/trackers$/, parseShared],
];
const parserFor = (path: string) => PARSERS.find(([shape]) => shape.test(path))?.[1] ?? null;

let allTag: string | null = null;
/** A server without the route answers 404: not asked again for a while (it arrives with a deploy). */
let allMissingUntil = 0;
const ALL_RETRY_MS = 30 * 60_000;

/**
 * Refresh every saved copy with one request. True when that covered it (also when the phone is
 * offline or was told to slow down: nothing else would get through either); false when each
 * screen has to be loaded by itself (an older server, or the route failed).
 */
export async function refreshAll(now = Date.now()): Promise<boolean> {
  if (isDemo || now < allMissingUntil) return false;
  try {
    const changed = await reads.all(async () => {
      const res = await send("/bootstrap", allTag ? { headers: { "if-none-match": allTag } } : {});
      if (res.status === 304) return "same";
      if (res.status === 404) return null;
      if (res.status !== 200) throw new HttpError(res.status);
      const body = JSON.parse(res.text) as { parts?: Record<string, string> };
      if (!body.parts || typeof body.parts !== "object") throw new HttpError(502);
      allTag = res.etag;
      return body.parts;
    }, parserFor);
    if (changed === null) {
      allMissingUntil = now + ALL_RETRY_MS;
      return false;
    }
    // Screens in view re-read their copies (from memory: they are fresh).
    if (changed) cacheRefreshed.emit();
    return true;
  } catch (err) {
    // Offline, or asked too often (429): loading each screen by itself would not help either.
    return isOffline(err) || (err instanceof HttpError && err.status === 429);
  }
}
