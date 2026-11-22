import Constants from "expo-constants";
import {
  AcceptInviteResponse,
  DaftarResponse,
  ListDaftarResponse,
  type CreateDaftarRequest,
  type DaftarEntry,
  BillingOffersResponse,
  CircleResponse,
  CreateInviteResponse,
  InvitePreview,
  ListCirclesResponse,
  type Circle,
  type CircleDetail,
  type CircleKind,
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
} from "@fakkarni/shared";
import { getInstallId } from "@/db/kv";
import { HttpError } from "@/sync/queue";
import { resolveApiUrl } from "./api-url";
import { accessToken } from "./supabase";

export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const TIMEOUT_MS = 20_000;

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
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

export async function createCircle(kind: CircleKind, name: string): Promise<CircleDetail> {
  return CircleResponse.parse(await request("/circles", { method: "POST", body: JSON.stringify({ kind, name }) })).circle;
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
