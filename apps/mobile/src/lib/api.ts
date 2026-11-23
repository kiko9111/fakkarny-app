import Constants from "expo-constants";
import {
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
import { HttpError } from "@/sync/queue";
import { resolveApiUrl } from "./api-url";
import { accessToken } from "./supabase";
import { isDemo } from "./demo";
import { demoRequest } from "@/demo/server";

export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const TIMEOUT_MS = 20_000;

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  if (isDemo) {
    try {
      return await demoRequest(path, init);
    } catch (err) {
      throw new HttpError((err as { status?: number }).status ?? 500);
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const token = await accessToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? ctrl.signal,
      headers: {
        // Only with a body: Fastify rejects an empty body sent as JSON.
        ...(init.body ? { "content-type": "application/json" } : {}),
        [INSTALL_ID_HEADER]: await getInstallId(),
        // Tells the server this build reads the newer message kinds ("upsell", "update").
        "x-message-kinds": "2",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) throw new HttpError(res.status);
    return res.status === 204 ? null : await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  if (!res.ok) throw new HttpError(res.status);
  return HealthResponse.parse(await res.json());
}

export async function postMessage(body: PostMessageRequest): Promise<PostMessageResponse> {
  return PostMessageResponse.parse(await request("/messages", { method: "POST", body: JSON.stringify(body) }));
}

/** Answer one of Zaki's action cards (Send / Cancel). Returns the reply with its cards updated. */
export async function actOnChatAction(messageId: string, actionId: string, confirm: boolean): Promise<WireMessage> {
  const res = (await request(`/messages/${encodeURIComponent(messageId)}/actions/${encodeURIComponent(actionId)}`, { method: "POST", body: JSON.stringify({ confirm }) })) as { message: unknown };
  return WireMessage.parse(res.message);
}

export async function patchItem(id: string, body: PatchItemRequest): Promise<Item> {
  return ItemResponse.parse(await request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(body) })).item;
}

export async function deleteMemory(id: string): Promise<void> {
  await request(`/memories/${id}`, { method: "DELETE" });
}

export async function listMessagesAfter(after: string | null): Promise<ListMessagesResponse> {
  const q = after ? `?after=${encodeURIComponent(after)}` : "";
  return ListMessagesResponse.parse(await request(`/messages${q}`));
}

export async function registerDevice(body: RegisterDeviceRequest): Promise<void> {
  await request("/devices", { method: "POST", body: JSON.stringify(body) });
}

export async function unregisterDevice(pushToken: string): Promise<void> {
  await request("/devices", { method: "DELETE", body: JSON.stringify({ push_token: pushToken }) });
}

export async function listMessagesPage(after: string | null, limit = 200): Promise<ListMessagesResponse> {
  const q = new URLSearchParams({ limit: String(limit), ...(after ? { after } : {}) });
  return ListMessagesResponse.parse(await request(`/messages?${q}`));
}

export async function listItems(status?: "open" | "done" | "cancelled") {
  return ListItemsResponse.parse(await request(`/items${status ? `?status=${status}` : ""}`)).items;
}

export async function getMe(): Promise<User> {
  return MeResponse.parse(await request("/me")).user;
}

export async function patchMe(body: PatchMeRequest): Promise<User> {
  return MeResponse.parse(await request("/me", { method: "PATCH", body: JSON.stringify(body) })).user;
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

export async function listMemories() {
  return ListMemoriesResponse.parse(await request("/memories")).memories;
}

/** Ask the server to re-read the RevenueCat entitlement (right after a purchase or restore). */
export async function refreshPlan(): Promise<User> {
  return MeResponse.parse(await request("/me/plan/refresh", { method: "POST" })).user;
}

export async function getBillingOffers(): Promise<BillingOffersResponse> {
  return BillingOffersResponse.parse(await request("/billing/offers"));
}

// Circles (Friends and Family spaces). These need a connection: they are shared records.
export async function listCircles(): Promise<Circle[]> {
  return ListCirclesResponse.parse(await request("/circles")).circles;
}

export async function createCircle(kind: CircleKind, name: string, familyType?: FamilyType | null): Promise<CircleDetail> {
  return CircleResponse.parse(await request("/circles", { method: "POST", body: JSON.stringify({ kind, name, ...(familyType ? { family_type: familyType } : {}) }) })).circle;
}

/** A member's place in the family (your own, or anyone's when you own the circle). */
export async function setFamilyRole(circleId: string, userId: string, role: FamilyRole | null): Promise<CircleDetail> {
  return CircleResponse.parse(await request(`/circles/${circleId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ family_role: role }) })).circle;
}

/** One-tap check-in, shared with the circle. */
export async function checkIn(circleId: string, kind: CheckinKind): Promise<CircleDetail> {
  return CircleResponse.parse(await request(`/circles/${circleId}/checkins`, { method: "POST", body: JSON.stringify({ kind }) })).circle;
}

/** Zaki asks a member to check in. Throws HttpError 409 when asked too recently. */
export async function askCheckin(circleId: string, userId: string): Promise<void> {
  await request(`/circles/${circleId}/members/${userId}/ask-checkin`, { method: "POST" });
}

/** Zaki's weekly summary (an extra: 402 after the circle's trial without Pro). */
export async function getCircleSummary(id: string): Promise<CircleSummary> {
  return CircleSummary.parse(await request(`/circles/${id}/summary`));
}

export async function getCircle(id: string): Promise<CircleDetail> {
  return CircleResponse.parse(await request(`/circles/${id}`)).circle;
}

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
export async function listDaftar(): Promise<DaftarEntry[]> {
  return ListDaftarResponse.parse(await request("/daftar")).entries;
}

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

export async function respondDaftar(id: string, answer: "confirm" | "dispute"): Promise<DaftarEntry> {
  return DaftarResponse.parse(await request(`/daftar/${id}/respond`, { method: "POST", body: JSON.stringify({ answer }) })).entry;
}

export async function settleDaftar(id: string): Promise<DaftarEntry> {
  return DaftarResponse.parse(await request(`/daftar/${id}/settle`, { method: "POST" })).entry;
}

export async function cancelDaftar(id: string): Promise<void> {
  await request(`/daftar/${id}/cancel`, { method: "POST" });
}

// Assigned tasks: ask someone in a circle; they accept first. Needs a connection.
export async function listTasks(): Promise<CircleTask[]> {
  return ListTasksResponse.parse(await request("/tasks")).tasks;
}

export async function getCircleFeed(circleId: string): Promise<CircleFeedResponse> {
  return CircleFeedResponse.parse(await request(`/circles/${circleId}/feed`));
}

// The circle feed: reactions, short comments, and asking Zaki in front of the circle.
export async function reactPost(circleId: string, postId: string, key: ReactionKey | null): Promise<CirclePost> {
  return PostResponse.parse(await request(`/circles/${circleId}/posts/${postId}/react`, { method: "POST", body: JSON.stringify({ key }) })).post;
}
export async function commentPost(circleId: string, postId: string, text: string): Promise<CirclePost> {
  return PostResponse.parse(await request(`/circles/${circleId}/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text }) })).post;
}
export async function deleteComment(circleId: string, commentId: string): Promise<void> {
  await request(`/circles/${circleId}/comments/${commentId}`, { method: "DELETE" });
}
export async function askZakiInCircle(circleId: string, text: string): Promise<CirclePost> {
  return PostResponse.parse(await request(`/circles/${circleId}/zaki`, { method: "POST", body: JSON.stringify({ text }) })).post;
}

export async function createTask(circleId: string, body: CreateTaskRequest): Promise<CircleTask> {
  return TaskResponse.parse(await request(`/circles/${circleId}/tasks`, { method: "POST", body: JSON.stringify(body) })).task;
}

export async function respondTask(id: string, answer: "accept" | "decline"): Promise<CircleTask> {
  return TaskResponse.parse(await request(`/tasks/${id}/respond`, { method: "POST", body: JSON.stringify({ answer }) })).task;
}

const taskAction = (verb: "done" | "cancel" | "nudge") => async (id: string): Promise<CircleTask> => TaskResponse.parse(await request(`/tasks/${id}/${verb}`, { method: "POST" })).task;
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
  return TaskResponse.parse(await request(`/tasks/${id}/submit`, { method: "POST", body: JSON.stringify({ text, photos }), ...(photos.length ? { signal: slow() } : {}) })).task;
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
  return TaskResponse.parse(await request(`/tasks/${id}/review`, { method: "POST", body: JSON.stringify({ verdict, ...(note ? { note } : {}) }) })).task;
}
export async function remindTask(id: string, remind_at: string | null): Promise<CircleTask> {
  return TaskResponse.parse(await request(`/tasks/${id}/remind`, { method: "POST", body: JSON.stringify({ remind_at }) })).task;
}

// Trackers dashboard. Needs a connection; chat messages feed it on the server too.
export async function listTrackers(): Promise<ListTrackersResponse> {
  return ListTrackersResponse.parse(await request("/trackers"));
}

export async function createTracker(body: CreateTrackerRequest): Promise<Tracker> {
  return TrackerResponse.parse(await request("/trackers", { method: "POST", body: JSON.stringify(body) })).tracker;
}

/** One tap (no amount) adds the template's step; money trackers send the amount. */
export async function updateTracker(id: string, body: UpdateTrackerRequest): Promise<Tracker> {
  return TrackerResponse.parse(await request(`/trackers/${id}`, { method: "PATCH", body: JSON.stringify(body) })).tracker;
}

export async function getCircleTrackers(circleId: string): Promise<SharedTracker[]> {
  return SharedTrackersResponse.parse(await request(`/circles/${circleId}/trackers`)).trackers;
}

export async function logTracker(id: string, amount?: number): Promise<Tracker> {
  return TrackerResponse.parse(await request(`/trackers/${id}/entries`, { method: "POST", body: JSON.stringify(amount === undefined ? {} : { amount }) })).tracker;
}

export async function undoTracker(id: string): Promise<Tracker> {
  return TrackerResponse.parse(await request(`/trackers/${id}/undo`, { method: "POST" })).tracker;
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
}

// Wider Daftar: expense / income sections and circle shared books. Needs a connection.
export async function getMoney(month?: string): Promise<MoneyOverview> {
  return MoneyOverview.parse(await request(`/money${month ? `?month=${month}` : ""}`));
}
export async function createSection(body: CreateSectionRequest): Promise<MoneySection> {
  return SectionResponse.parse(await request("/money/sections", { method: "POST", body: JSON.stringify(body) })).section;
}
export async function getSection(id: string, month?: string): Promise<SectionDetail> {
  return SectionDetail.parse(await request(`/money/sections/${id}${month ? `?month=${month}` : ""}`));
}
export async function deleteSection(id: string): Promise<void> {
  await request(`/money/sections/${id}`, { method: "DELETE" });
}
export async function addMoney(id: string, body: AddMoneyEntryRequest): Promise<MoneySection> {
  return SectionResponse.parse(await request(`/money/sections/${id}/entries`, { method: "POST", body: JSON.stringify(body) })).section;
}
export async function deleteMoneyEntry(id: string): Promise<void> {
  await request(`/money/entries/${id}`, { method: "DELETE" });
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
  await request("/events", { method: "POST", body: JSON.stringify(body) });
}

// Split the check: needs a connection (the page everyone opens lives on the server).
export async function createSplit(body: SplitInput): Promise<SplitResponse> {
  return SplitResponse.parse(await request("/splits", { method: "POST", body: JSON.stringify(body) }));
}
export async function listSplits(): Promise<Split[]> {
  return ListSplitsResponse.parse(await request("/splits")).splits;
}
export async function getSplit(id: string): Promise<SplitResponse> {
  return SplitResponse.parse(await request(`/splits/${id}`));
}
export async function updateSplit(id: string, body: UpdateSplitRequest): Promise<SplitResponse> {
  return SplitResponse.parse(await request(`/splits/${id}`, { method: "PUT", body: JSON.stringify(body) }));
}
export async function markSplitPaid(id: string, index: number, paid: boolean): Promise<SplitResponse> {
  return SplitResponse.parse(await request(`/splits/${id}/paid`, { method: "POST", body: JSON.stringify({ index, paid }) }));
}
export async function deleteSplit(id: string): Promise<void> {
  await request(`/splits/${id}`, { method: "DELETE" });
}
