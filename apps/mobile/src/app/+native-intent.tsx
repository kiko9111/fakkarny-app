import { widgetRoute } from "@/widget/data";

/**
 * Links from the home-screen widget (fakkarni://widget/<where>, modules/zaki-widget) open their
 * screen. Every other link passes through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return widgetRoute(path) ?? path;
  } catch {
    return path;
  }
}
