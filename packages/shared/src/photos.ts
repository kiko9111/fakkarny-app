import { z } from "zod";

/**
 * Photos (owner decision, 2026-11-23): an exception to "text only", for two things only.
 * - Receipts: read once by the AI into a Receipt (amount, place, items) and never stored.
 * - Homework: the pages a child hands in, kept privately for the child and the parent who set
 *   it, deleted PHOTO_KEEP_DAYS after upload.
 * The phone sends JPEG/PNG/WebP as base64, already shrunk by the picker.
 */
export const PHOTO_MIME = z.enum(["image/jpeg", "image/png", "image/webp"]);
export type PhotoMime = z.infer<typeof PHOTO_MIME>;
/** About 3 MB of image (base64 is 4/3 the size). */
export const MAX_PHOTO_B64 = 4_200_000;
export const MAX_HOMEWORK_PHOTOS = 5;
export const PHOTO_KEEP_DAYS = 90;

export const PhotoUpload = z.object({ mime: PHOTO_MIME, data: z.string().min(100).max(MAX_PHOTO_B64).regex(/^[A-Za-z0-9+/=\s]+$/) });
export type PhotoUpload = z.infer<typeof PhotoUpload>;

/** POST /receipts/read */
export const ReadReceiptRequest = z.object({ photo: PhotoUpload });
export type ReadReceiptRequest = z.infer<typeof ReadReceiptRequest>;

export const ReceiptItem = z.object({ name: z.string().max(80), price: z.number().nonnegative(), qty: z.number().int().positive().default(1) });
export type ReceiptItem = z.infer<typeof ReceiptItem>;

export const Receipt = z.object({
  merchant: z.string().max(80),
  /** Local date on the receipt, YYYY-MM-DD, when readable. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().max(8),
  /** What was paid in the end, service and VAT included. */
  total: z.number().nonnegative(),
  /** Before service and VAT, when printed. */
  subtotal: z.number().nonnegative().nullable(),
  service: z.number().nonnegative(),
  vat: z.number().nonnegative(),
  items: z.array(ReceiptItem).max(60),
  /** A best guess at the spending kind for the Daftar section ("groceries", "restaurant", …). */
  category: z.string().max(40),
});
export type Receipt = z.infer<typeof Receipt>;

export const ReadReceiptResponse = z.object({
  receipt: Receipt.nullable(),
  /** "unreadable": not a receipt or too blurry; "limit": out of today's AI messages. */
  error: z.enum(["unreadable", "limit"]).nullable(),
  ai_allowance: z.object({ limit: z.number().int().nullable(), used: z.number().int().nonnegative() }).optional(),
});
export type ReadReceiptResponse = z.infer<typeof ReadReceiptResponse>;
