import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { PRO_ENTITLEMENT } from "@fakkarni/shared";
import { getBillingOffers, getMe, refreshPlan } from "@/lib/api";
import { arrangeOptions, planKind, type PlanKind } from "./options";
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
  kind: PlanKind;
  price: string;
  hasTrial: boolean;
}

/** Every package in the current offering (Pro, Family, founders' offer), in display order. */
export async function getPlanOptions(): Promise<PlanOption[]> {
  if (!(await ensurePurchases())) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return [];
  const opts: PlanOption[] = current.availablePackages.map((pkg) => ({
    pkg,
    kind: planKind(pkg.product.identifier),
    price: pkg.product.priceString,
    hasTrial: Boolean(pkg.product.introPrice),
  }));
  // If the server can't be reached, don't offer a deal that may be sold out.
  const foundersLeft = opts.some((o) => o.kind === "founders") ? await getBillingOffers().then((o) => o.founders_left).catch(() => 0) : 0;
  return arrangeOptions(opts, foundersLeft);
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
