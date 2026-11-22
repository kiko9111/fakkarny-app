import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { linkAccount } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { fullSync } from "@/sync/full";
import type { Contact } from "./contact";

/** Sign-in options (FR-10): a code by email or SMS, Apple, Google — all through Supabase Auth. */
export const authAvailable = supabase !== null;
// Each provider has to be switched on in Supabase first; offering one that is off only
// shows the user an error. Email links need no provider, so they are always available.
export const appleAvailable = Platform.OS === "ios" && process.env.EXPO_PUBLIC_SIGNIN_APPLE === "1";
export const googleAvailable = process.env.EXPO_PUBLIC_SIGNIN_GOOGLE === "1";
export const phoneAvailable = process.env.EXPO_PUBLIC_SIGNIN_PHONE === "1";

/** After any successful sign-in: keep what this phone captured, then pull the full chat. */
async function afterSignIn() {
  await linkAccount();
  await fullSync();
}

/**
 * Sends a 6-digit code: by email (through the project's own SMTP sender, whose template
 * carries the code) or by SMS. The email has no link, so it works on any device.
 */
export async function sendCode(contact: Contact) {
  if (!supabase) throw new Error("auth not configured");
  const { error } =
    contact.kind === "email"
      ? await supabase.auth.signInWithOtp({ email: contact.value, options: { shouldCreateUser: true, emailRedirectTo: Linking.createURL("auth/callback") } })
      : await supabase.auth.signInWithOtp({ phone: contact.value });
  if (error) throw error;
}

export async function verifyCode(contact: Contact, token: string) {
  if (!supabase) throw new Error("auth not configured");
  const { error } =
    contact.kind === "email"
      ? await supabase.auth.verifyOtp({ email: contact.value, token, type: "email" })
      : await supabase.auth.verifyOtp({ phone: contact.value, token, type: "sms" });
  if (error) throw error;
  await afterSignIn();
}

// A sign-in code can be exchanged only once, but the callback screen and the Google
// flow can both receive the same redirect: share one exchange per code.
const exchanges = new Map<string, Promise<void>>();

/** Finish a sign-in that came back to fakkarni://auth/callback?code=… (email link, Google). */
export function completeCallback(code: string): Promise<void> {
  let pending = exchanges.get(code);
  if (!pending) {
    pending = (async () => {
      if (!supabase) throw new Error("auth not configured");
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      await afterSignIn();
    })();
    exchanges.set(code, pending);
  }
  return pending;
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
  await completeCallback(code);
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
