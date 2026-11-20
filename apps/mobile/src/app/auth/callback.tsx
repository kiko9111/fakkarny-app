import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { completeCallback } from "@/auth";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { colors } from "@/lib/theme";

/** Where the emailed sign-in link (and the Google redirect) lands: fakkarni://auth/callback?code=… */
export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!code) {
      setFailed(true);
      return;
    }
    completeCallback(code)
      .then(() => {
        prefs.set("onboarded", "1");
        if (active) router.replace("/");
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <View style={styles.page}>
      {failed ? (
        <>
          <Text style={styles.text}>{t.onboarding.linkFailed}</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/onboarding")}>
            <Text style={styles.buttonText}>{t.onboarding.tryAgain}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.text}>{t.onboarding.signingIn}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 16, alignItems: "center", justifyContent: "center" },
  text: { color: colors.text, fontSize: 17, textAlign: "center" },
  button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
