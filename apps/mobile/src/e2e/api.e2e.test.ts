/**
 * End-to-end smoke test: the phone's own API client (src/lib/api.ts, with its zod parsing)
 * against a running API. Skipped unless E2E_API_URL is set, e.g.
 *   DISABLE_JOBS=1 ALLOW_INSTALL_ID=1 PORT=3999 npx tsx --env-file=.env src/server.ts   (apps/api)
 *   E2E_API_URL=http://localhost:3999 npx vitest run src/e2e                            (apps/mobile)
 * Two phones (install ids) walk through every shared feature, so a server reply the app
 * can't parse fails here instead of on a device.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const URL_ = process.env.E2E_API_URL;
let installId = "";

vi.mock("expo-constants", () => ({ default: { expoConfig: null } }));
vi.mock("@/db/kv", () => ({ getInstallId: async () => installId }));
vi.mock("@/lib/supabase", () => ({ accessToken: async () => null }));
vi.mock("@/lib/demo", () => ({ isDemo: false }));
vi.mock("@/demo/server", () => ({ demoRequest: async () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

type Api = typeof import("@/lib/api");
let api: Api;
const A = crypto.randomUUID();
const B = crypto.randomUUID();
const as = async <T>(who: string, work: () => Promise<T>): Promise<T> => {
  installId = who;
  return work();
};

describe.skipIf(!URL_)("phone client against a live API", () => {
  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_URL = URL_;
    api = await import("@/lib/api");
  });

  it("walks every feature as two people", async () => {
    // Me
    const me = await as(A, () => api.getMe());
    expect(me.id).toBeTruthy();
    await as(A, () => api.patchMe({ name: "Mona", timezone: "Africa/Cairo", language: "ar-EG" }));
    await as(B, () => api.patchMe({ name: "Omar", timezone: "Africa/Cairo", language: "ar-EG" }));

    // Chat: a message is stored (no model key: no reply)
    const now = new Date().toISOString();
    await as(A, () => api.postMessage({ client_id: crypto.randomUUID(), text: "فكرني اشتري لبن بكرة", created_at: now, timezone: "Africa/Cairo" }));
    await as(A, () => api.listMessagesPage(null));
    await as(A, () => api.listItems());
    await as(A, () => api.listMemories());

    // Circles
    const c = await as(A, () => api.createCircle("family", "البيت", "parents_teens"));
    expect((await as(A, () => api.listCircles())).map((x) => x.id)).toContain(c.id);
    const inv = await as(A, () => api.createInvite(c.id));
    const preview = await as(B, () => api.previewInvite(inv.invite.code));
    expect(preview.state).toBe("open");
    await as(B, () => api.acceptInvite(inv.invite.code));
    const detail = await as(A, () => api.getCircle(c.id));
    expect(detail.members).toHaveLength(2);
    const omar = detail.members.find((m) => !m.is_me)!;
    await as(A, () => api.setFamilyRole(c.id, omar.user_id, "teen"));
    await as(B, () => api.checkIn(c.id, "home"));
    await as(A, () => api.askCheckin(c.id, omar.user_id));
    await as(A, () => api.getCircleSummary(c.id));

    // Tasks + homework
    const task = await as(A, () => api.createTask(c.id, { assignee_id: omar.user_id, title: "واجب العربي", homework: true, note: "صفحة 12" }));
    await as(B, () => api.respondTask(task.id, "accept"));
    await as(B, () => api.submitHomework(task.id, "خلصت"));
    await as(A, () => api.reviewHomework(task.id, "approved"));
    await as(A, () => api.listTasks());
    await as(B, () => api.listTasks());

    // Feed
    const feed = await as(A, () => api.getCircleFeed(c.id));
    expect(feed.posts.length).toBeGreaterThan(0);
    const post = feed.posts[0]!;
    await as(B, () => api.reactPost(c.id, post.id, "heart"));
    const commented = await as(B, () => api.commentPost(c.id, post.id, "برافو"));
    await as(A, () => api.askZakiInCircle(c.id, "@زكي فكر الكل"));
    await as(B, () => api.getCircleFeed(c.id));
    await as(B, () => api.getCircle(c.id));
    if (commented.comments[0]) await as(B, () => api.deleteComment(c.id, commented.comments[0]!.id));

    // Trackers
    const tr = await as(A, () => api.createTracker({ kind: "water", circle_id: c.id }));
    await as(A, () => api.logTracker(tr.id));
    await as(A, () => api.listTrackers());
    await as(B, () => api.getCircleTrackers(c.id));
    await as(A, () => api.undoTracker(tr.id));

    // Daftar (debts)
    const d = await as(A, () => api.createDaftar({ other_name: "Omar", direction: "owed_to_me", amount: 200, circle_id: c.id, other_user_id: omar.user_id, note: "عشا" }));
    await as(A, () => api.listDaftar());
    await as(B, () => api.listDaftar());
    await as(B, () => api.respondDaftar(d.entry.id, "confirm"));
    await as(A, () => api.daftarShareText(d.entry.id));
    await as(A, () => api.settleDaftar(d.entry.id));

    // Money
    const sec = await as(A, () => api.createSection({ id: crypto.randomUUID(), name: "أكل", kind: "expense", budget: 3000 }));
    await as(A, () => api.addMoney(sec.id, { id: crypto.randomUUID(), amount: 150, note: "عيش" }));
    await as(A, () => api.getMoney());
    await as(A, () => api.getSection(sec.id));
    await as(A, () => api.getMonthGift().catch(() => null));

    // Split
    const sp = await as(A, () => api.createSplit({ title: "عشا", people: [{ name: "Mona" }, { name: "Omar" }], items: [{ name: "بيتزا", price: 300, eaters: [] }], subtotal: 300 } as never));
    await as(A, () => api.listSplits());
    await as(A, () => api.getSplit(sp.split.id));
    await as(A, () => api.markSplitPaid(sp.split.id, 1, true));

    // Referral, billing, export
    await as(A, () => api.getReferral());
    await as(A, () => api.getBillingOffers());
    await as(A, () => api.exportData());
    await as(A, () => api.getSessionState().catch((e) => e));

    // Back to the chat: B's chat carries Zaki's update lines with cards
    await as(B, () => api.listMessagesPage(null));
  }, 60_000);
});
