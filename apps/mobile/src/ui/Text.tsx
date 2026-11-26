import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { palette, textStart, type as typeScale, type TypeRole } from "./tokens";

type Props = TextProps & { variant?: TypeRole; color?: string; align?: "start" | "center" | "end"; style?: TextStyle | (TextStyle | false | null | undefined)[] };

/**
 * All text goes through here so the type scale, colour and reading direction stay consistent.
 * Android lays text out with "simple" line breaking: with its default ("highQuality") a short
 * label such as a chip's "This is homework" was measured for one line, then drawn on two, and
 * the last word was cut off (kareem's Pixel, 2026-11-26).
 */
export function Text({ variant = "body", color = palette.ink, align = "start", style, ...rest }: Props) {
  const textAlign = align === "center" ? "center" : align === "start" ? textStart : textStart === "left" ? "right" : "left";
  return <RNText textBreakStrategy="simple" {...rest} style={[typeScale[variant], { color, textAlign, writingDirection: "auto" }, style]} />;
}
