import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { t } from "@/i18n";
import { Appear, glass, palette, radius, space, ZakiAvatar } from "@/ui";

/** Three soft dots that take turns: Zaki is writing. `small` sits under the words of a reply still being written. */
export function TypingDots({ small = false }: { small?: boolean }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(
        160,
        dots.map((v) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== "web" }),
            Animated.timing(v, { toValue: 0, duration: 320, useNativeDriver: Platform.OS !== "web" }),
          ]),
        ),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [dots]);

  return (
    <View style={small ? styles.dotsSmall : styles.dots}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[small ? styles.dotSmall : styles.dot, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, small ? -2 : -3] }) }] }]}
        />
      ))}
    </View>
  );
}

/** Zaki's face and the dots while the reply is being written. */
export function TypingIndicator() {
  return (
    <Appear style={styles.row} rise={6} ms={160}>
      <ZakiAvatar size={28} />
      <View style={styles.bubble} accessibilityLabel={t.ui.zakiTyping}>
        <TypingDots />
      </View>
    </Appear>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, alignSelf: "flex-start", marginVertical: space.xs },
  bubble: { ...glass, borderRadius: radius.lg, borderBottomStartRadius: 6, paddingHorizontal: space.lg, paddingVertical: 14 },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary },
  dotsSmall: { flexDirection: "row", gap: 4, paddingTop: 6, paddingBottom: 2 },
  dotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.primary },
});
