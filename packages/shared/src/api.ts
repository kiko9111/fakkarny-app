import { z } from "zod";

/** GET /health */
export const HealthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("fakkarni-api"),
  version: z.string(),
  time: z.iso.datetime({ offset: true }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** POST /messages — body sent by the phone's sync queue (M2). */
export const PostMessageRequest = z.object({
  client_id: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  created_at: z.iso.datetime({ offset: true }),
});
export type PostMessageRequest = z.infer<typeof PostMessageRequest>;
