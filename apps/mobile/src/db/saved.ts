import type { PostMessageResponse } from "@fakkarni/shared";

/** What the "Saved" chip under a user message shows. Stored as JSON on the message row. */
export interface SavedSummary {
  items: { id: string; type: string; title: string; due_at: string | null; remind_at?: string | null; alarm?: boolean }[];
  memories: { id: string; subject: string; content: string }[];
}

export function summarizeSaved(res: Pick<PostMessageResponse, "items" | "memories">): SavedSummary | null {
  if (res.items.length === 0 && res.memories.length === 0) return null;
  return {
    items: res.items.map(({ id, type, title, due_at, remind_at, alarm }) => ({ id, type, title, due_at, remind_at, alarm })),
    memories: res.memories.map(({ id, subject, content }) => ({ id, subject, content })),
  };
}

export function parseSaved(json: string | null): SavedSummary | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SavedSummary;
  } catch {
    return null;
  }
}
