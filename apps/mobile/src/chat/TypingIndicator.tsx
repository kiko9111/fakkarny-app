import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { glass, palette, radius, shadow, space, ZakiAvatar } from "@/ui";

/** Zaki's face and three soft dots while the reply is being written. */
export function TypingIndicator() {
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
    <View style={styles.row} accessibilityLabel="typing">
      <ZakiAvatar size={28} />
      <View style={styles.bubble}>
        {dots.map((v, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, alignSelf: "flex-start", marginVertical: space.xs },
  bubble: { ...glass, flexDirection: "row", gap: 5, borderRadius: radius.lg, borderBottomStartRadius: 6, paddingHorizontal: space.lg, paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary },
});
