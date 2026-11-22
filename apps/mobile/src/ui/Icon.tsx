import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { isRTL } from "@/i18n";
import { palette } from "./tokens";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Icons that point somewhere (arrows, send) mirror in Arabic. */
const DIRECTIONAL = new Set<string>(["send", "arrow-forward", "arrow-back", "chevron-forward", "chevron-back", "chevron-forward-outline", "arrow-undo-outline"]);

/** One drawn icon set (Ionicons outline) for the whole app. */
export function Icon({ name, size = 22, color = palette.ink }: { name: IconName; size?: number; color?: string }) {
  const flip = isRTL && DIRECTIONAL.has(name);
  return <Ionicons name={name} size={size} color={color} style={flip ? { transform: [{ scaleX: -1 }] } : undefined} />;
}
