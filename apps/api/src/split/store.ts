import { z } from "zod";
import { SplitItem, SplitPerson, splitBill, type Split, type SplitInput } from "@fakkarni/shared";
import type { Split as SplitRow } from "../generated/prisma/client";

/** Wire shape of a stored split. */
export const splitUrl = (base: string, code: string) => `${base}/s/${code}`;
const peopleOf = (row: SplitRow) => z.array(SplitPerson).parse(row.peopleJson);
const itemsOf = (row: SplitRow) => z.array(SplitItem).parse(row.itemsJson);

/** Turn a stored row back into the input it was made from (to add an item and work it out again). */
export function inputOf(row: SplitRow): SplitInput {
  return {
    title: row.title,
    people: peopleOf(row).map((p) => (p.user_id ? { name: p.name, user_id: p.user_id } : { name: p.name })),
    items: itemsOf(row),
    subtotal: row.bill === null ? null : Number(row.bill),
    service_pct: Number(row.servicePct),
    vat_pct: Number(row.vatPct),
    vat_on_service: row.vatOnService,
    tip: Number(row.tip),
    paid_by: row.paidBy,
    circle_id: row.circleId,
  };
}

/**
 * The columns for a split: the server always does the math, so the app, the page and the
 * WhatsApp message agree. `paid` keeps who already paid back, by name.
 */
export function computeSplit(input: SplitInput, paidNames: Set<string> = new Set()) {
  const r = splitBill(input);
  const people = input.people.map((p, i) => ({
    name: p.name,
    ordered: Math.round(r.ordered[i]! * 100) / 100,
    share: r.shares[i]!,
    paid: i === input.paid_by || paidNames.has(p.name),
    ...(p.user_id ? { user_id: p.user_id } : {}),
  }));
  return {
    title: input.title,
    subtotal: Math.round(r.subtotal * 100) / 100,
    bill: input.subtotal,
    servicePct: input.service_pct,
    vatPct: input.vat_pct,
    vatOnService: input.vat_on_service,
    tip: input.tip,
    total: r.total,
    peopleJson: people,
    itemsJson: input.items.map((it) => ({ name: it.name, price: it.price, eaters: [...new Set(it.eaters.filter((e) => e < input.people.length))] })),
    paidBy: input.paid_by,
  };
}

/** Who is looking: the creator (default) or one of the people (read-only, sees their own row). */
export interface SplitViewer {
  id: string;
  ownerName?: string | null;
  instapay?: string | null;
}

export function toWireSplit(row: SplitRow, base: string, viewer?: SplitViewer): Split {
  const mine = !viewer || viewer.id === row.userId;
  const people = peopleOf(row).map((p) => (p.user_id && !(row.memberIds.includes(p.user_id) || p.user_id === row.userId) ? { ...p, user_id: null } : p));
  const me = viewer && !mine ? people.findIndex((p) => p.user_id === viewer.id) : -1;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    service_pct: Number(row.servicePct),
    vat_pct: Number(row.vatPct),
    vat_on_service: row.vatOnService,
    tip: Number(row.tip),
    total: Number(row.total),
    people,
    items: itemsOf(row),
    bill: row.bill === null ? null : Number(row.bill),
    web_adds: row.webAdds,
    paid_by: row.paidBy,
    url: splitUrl(base, row.code),
    created_at: row.createdAt.toISOString(),
    circle_id: row.circleId,
    mine,
    me: me >= 0 ? me : null,
    owner_name: mine ? null : viewer?.ownerName ?? null,
    instapay: viewer?.instapay ?? null,
  };
}

export const paidNamesOf = (row: SplitRow) => new Set(peopleOf(row).filter((p, i) => p.paid && i !== row.paidBy).map((p) => p.name));
