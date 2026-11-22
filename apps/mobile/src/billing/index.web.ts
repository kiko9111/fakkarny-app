import type { PlanKind } from "./options";

/** No store purchases in the browser preview; the paywall shows sample prices instead. */
export const billingAvailable = false;
export interface PlanOption {
  kind: PlanKind;
  price: string;
  hasTrial: boolean;
}
export async function ensurePurchases(): Promise<boolean> {
  return false;
}
/** Sample prices so the paywall can be seen in the preview (the real ones come from the store). */
export async function getPlanOptions(): Promise<PlanOption[]> {
  return [
    { kind: "founders", price: "EGP 499", hasTrial: false },
    { kind: "pro_yearly", price: "EGP 999", hasTrial: true },
    { kind: "pro_monthly", price: "EGP 129", hasTrial: true },
    { kind: "family_yearly", price: "EGP 1,499", hasTrial: false },
    { kind: "family_monthly", price: "EGP 179", hasTrial: false },
  ];
}
export async function purchase(_option: PlanOption): Promise<boolean> {
  return false;
}
export async function restore(): Promise<boolean> {
  return false;
}
