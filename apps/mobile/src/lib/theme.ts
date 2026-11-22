import { palette } from "@/ui/tokens";

/** Older name for a few palette colours; new code imports `palette` from @/ui/tokens. */
export const colors = {
  bg: palette.bg,
  text: palette.ink,
  muted: palette.inkSoft,
  accent: palette.primary,
  friendBubble: palette.surface,
  ok: palette.ok,
  error: palette.danger,
} as const;
