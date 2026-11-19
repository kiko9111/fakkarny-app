import Constants from "expo-constants";
import {
  HealthResponse,
  INSTALL_ID_HEADER,
  ItemResponse,
  PostMessageResponse,
  type Item,
  type PatchItemRequest,
  type PostMessageRequest,
} from "@fakkarni/shared";
import { getInstallId } from "@/db/kv";
import { HttpError } from "@/sync/queue";
import { resolveApiUrl } from "./api-url";

export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const TIMEOUT_MS = 20_000;

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? ctrl.signal,
      headers: {
        // Only with a body: Fastify rejects an empty body sent as JSON.
        ...(init.body ? { "content-type": "application/json" } : {}),
        [INSTALL_ID_HEADER]: await getInstallId(),
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
