import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { appleAvailable, authAvailable, sendPhoneCode, signInWithApple, signInWithGoogle, verifyPhoneCode } from "@/auth";
import { language, t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { colors } from "@/lib/theme";

/**
 * F1 (under 2 minutes): pick a language, sign in with phone OTP, Apple or Google.
 * No tutorial screens — afterwards the friend opens the chat and asks your name.
 */
export default function OnboardingScreen() {
  const [step, setStep] = useState<"language" | "signin">(prefs.get("language") ? "signin" : "language");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    prefs.set("onboarded", "1");
    router.replace("/");
  };

  const run = async (fn: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    try {
      await fn();
      then ? then() : finish();
    } catch {
      Alert.alert(t.onboarding.failed);
    } finally {
      setBusy(false);
    }
  };

  const pickLanguage = (lang: "ar-EG" | "en") => {
    prefs.set("language", lang);
    // Switching language (and RTL) needs a reload; the app reopens on the sign-in step.
    if (lang !== language) void reloadApp();
    else setStep("signin");
  };

  if (step === "language") {
    return (
      <View style={styles.page}>
        <Text style={styles.title}>{t.onboarding.pickLanguage}</Text>
        <Pressable style={styles.primary} onPress={() => pickLanguage("ar-EG")}>
          <Text style={styles.primaryText}>{t.onboarding.arabic}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => pickLanguage("en")}>
          <Text style={styles.primaryText}>{t.onboarding.english}</Text>
        </Pressable>
        <Text style={styles.disclosure}>{t.settings.aiDisclosure}</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>{t.onboarding.signInTitle}</Text>
      {!authAvailable ? <Text style={styles.note}>{t.onboarding.notConfigured}</Text> : null}
      {authAvailable ? (
        <>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t.onboarding.phone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textAlign="left"
          />
          {codeSent ? (
            <>
              <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={t.onboarding.code} keyboardType="number-pad" autoComplete="one-time-code" textAlign="center" />
              <Pressable style={styles.primary} disabled={busy} onPress={() => void run(() => verifyPhoneCode(phone.trim(), code.trim()))}>
                <Text style={styles.primaryText}>{t.onboarding.verify}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.primary} disabled={busy || phone.trim().length < 8} onPress={() => void run(() => sendPhoneCode(phone.trim()), () => setCodeSent(true))}>
              <Text style={styles.primaryText}>{t.onboarding.sendCode}</Text>
            </Pressable>
          )}
          {appleAvailable ? (
            <Pressable style={styles.secondary} disabled={busy} onPress={() => void run(signInWithApple)}>
              <Text style={styles.secondaryText}>{t.onboarding.apple}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondary} disabled={busy} onPress={() => void run(signInWithGoogle)}>
            <Text style={styles.secondaryText}>{t.onboarding.google}</Text>
          </Pressable>
        </>
      ) : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      <Pressable onPress={finish} style={styles.skip}>
        <Text style={styles.skipText}>{authAvailable ? t.onboarding.skip : t.onboarding.start}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 14, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 },
  note: { color: colors.muted, textAlign: "center" },
  disclosure: { color: colors.muted, textAlign: "center", marginTop: 12 },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  secondary: { borderWidth: 1, borderColor: colors.text, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  skip: { alignItems: "center", paddingVertical: 8 },
  skipText: { color: colors.muted, fontSize: 15 },
});
