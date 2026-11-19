import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

/** Three bouncing dots in a friend bubble while the reply is being written. */
export function TypingIndicator() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(
        150,
        dots.map((v) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [dots]);

  return (
    <View style={styles.bubble} accessibilityLabel="typing">
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.friendBubble,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
});
