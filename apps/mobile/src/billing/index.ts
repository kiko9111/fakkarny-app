import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { PRO_ENTITLEMENT } from "@fakkarni/shared";
import { getMe, refreshPlan } from "@/lib/api";
import { syncQueue } from "@/sync";

/**
 * FR-9: App Store / Google Play subscriptions through RevenueCat (needs a development
 * build and the public SDK keys). RevenueCat's app user id is our server user id, so the
 * webhook can update the right account.
 */
const apiKey = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
export const billingAvailable = Boolean(apiKey);

let configuredFor: string | null = null;

/** Configure (or switch user after sign-in). Safe to call repeatedly. */
export async function ensurePurchases(): Promise<boolean> {
  if (!apiKey) return false;
  const me = await getMe();
  if (configuredFor === me.id) return true;
  if (configuredFor === null) Purchases.configure({ apiKey, appUserID: me.id });
  else await Purchases.logIn(me.id);
  configuredFor = me.id;
  return true;
}

export interface PlanOption {
  pkg: PurchasesPackage;
  kind: "monthly" | "yearly";
  price: string;
  hasTrial: boolean;
}

export async function getPlanOptions(): Promise<PlanOption[]> {
  if (!(await ensurePurchases())) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return [];
  const opts: PlanOption[] = [];
  for (const [kind, pkg] of [["yearly", current.annual], ["monthly", current.monthly]] as const) {
    if (pkg) opts.push({ pkg, kind, price: pkg.product.priceString, hasTrial: Boolean(pkg.product.introPrice) });
  }
  return opts;
}

/** After the store confirms, ask the server to refresh the plan, then send anything queued. */
async function unlock() {
  await refreshPlan().catch(() => {}); // the webhook catches up if this fails
  void syncQueue.wake();
}

export async function purchase(option: PlanOption): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(option.pkg);
  const active = Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT]);
  if (active) await unlock();
  return active;
}

export async function restore(): Promise<boolean> {
  if (!(await ensurePurchases())) return false;
  const info = await Purchases.restorePurchases();
  const active = Boolean(info.entitlements.active[PRO_ENTITLEMENT]);
  if (active) await unlock();
  return active;
}
