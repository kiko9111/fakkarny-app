/**
 * The sign-in field takes a phone number or an email. Pure, so it is unit-tested
 * (the rest of src/auth imports react-native).
 */
export type Contact = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Null until the input is a usable email or an international phone number. */
export function parseContact(input: string): Contact | null {
  const text = input.trim();
  if (text.includes("@")) return EMAIL_RE.test(text) ? { kind: "email", value: text.toLowerCase() } : null;
  // Phones: accept Arabic-Indic digits, spaces and dashes; keep a leading +.
  const digits = text.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/[\s\-()]/g, "");
  return /^\+?\d{8,15}$/.test(digits) ? { kind: "phone", value: digits } : null;
}
