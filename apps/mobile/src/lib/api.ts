import Constants from "expo-constants";
import {
  BillingOffersResponse,
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
