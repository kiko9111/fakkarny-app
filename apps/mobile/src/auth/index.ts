import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { linkAccount } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { fullSync } from "@/sync/full";

/** Sign-in options (FR-10): phone OTP, Apple, Google — all through Supabase Auth. */
export const authAvailable = supabase !== null;
export const appleAvailable = Platform.OS === "ios";

/** After any successful sign-in: keep what this phone captured, then pull the full chat. */
async function afterSignIn() {
  await linkAccount();
  await fullSync();
}

export async function sendPhoneCode(phone: string) {
  if (!supabase) throw new Error("auth not configured");
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneCode(phone: string, token: string) {
  if (!supabase) throw new Error("auth not configured");
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
  await afterSignIn();
}

export async function signInWithApple() {
  if (!supabase) throw new Error("auth not configured");
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
  });
  if (!credential.identityToken) throw new Error("no identity token");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken });
  if (error) throw error;
  await afterSignIn();
}

/** Google via Supabase OAuth in the system browser (PKCE), returning to fakkarni://auth/callback. */
export async function signInWithGoogle() {
  if (!supabase) throw new Error("auth not configured");
  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error("no auth url");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new Error("cancelled");
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("no code");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  await afterSignIn();
}

export async function currentAccountLabel(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? (u.phone ? `+${u.phone}` : (u.email ?? "")) : null;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
