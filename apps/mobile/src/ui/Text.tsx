import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { palette, textStart, type as typeScale, type TypeRole } from "./tokens";

type Props = TextProps & { variant?: TypeRole; color?: string; align?: "start" | "center" | "end"; style?: TextStyle | (TextStyle | false | null | undefined)[] };

/** All text goes through here so the type scale, colour and reading direction stay consistent. */
export function Text({ variant = "body", color = palette.ink, align = "start", style, ...rest }: Props) {
  const textAlign = align === "center" ? "center" : align === "start" ? textStart : textStart === "left" ? "right" : "left";
  return <RNText {...rest} style={[typeScale[variant], { color, textAlign, writingDirection: "auto" }, style]} />;
}
