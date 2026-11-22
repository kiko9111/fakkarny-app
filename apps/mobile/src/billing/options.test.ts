import { describe, expect, it } from "vitest";
import { arrangeOptions, isFamily, isYearly, planKind } from "./options";

describe("plan options", () => {
  it("reads the plan from the product id", () => {
    expect(planKind("zaki_pro_monthly")).toBe("pro_monthly");
    expect(planKind("zaki_pro_yearly:base")).toBe("pro_yearly");
    expect(planKind("zaki_family_monthly")).toBe("family_monthly");
    expect(planKind("zaki_family_annual")).toBe("family_yearly");
    expect(planKind("zaki_founders_yearly")).toBe("founders");
    expect(planKind("fakkarni_monthly")).toBe("pro_monthly");
    expect(isYearly("founders")).toBe(true);
    expect(isFamily("family_monthly")).toBe(true);
  });
  it("orders options and hides the founders' offer when it is sold out", () => {
    const all = (["family_monthly", "pro_monthly", "founders", "pro_yearly", "pro_monthly"] as const).map((kind, n) => ({ kind, n }));
    expect(arrangeOptions(all, 10).map((o) => o.kind)).toEqual(["founders", "pro_yearly", "pro_monthly", "family_monthly"]);
    expect(arrangeOptions(all, 0).map((o) => o.kind)).toEqual(["pro_yearly", "pro_monthly", "family_monthly"]);
    expect(arrangeOptions(all, 10).find((o) => o.kind === "pro_monthly")?.n).toBe(1);
  });
});
