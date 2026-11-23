import { requireOptionalNativeModule } from "expo";

/**
 * "Pick from contacts": optional. Builds made before expo-contacts was added still take
 * JavaScript updates over the air, so the button only shows when the native module exists.
 * Permission is asked when the button is tapped, never before, and only the picked
 * contact's name is read.
 */
export const contactsAvailable = requireOptionalNativeModule("ExpoContactsNext") != null;

export type PickResult = { name: string } | { denied: true } | null;

export async function pickContactName(): Promise<PickResult> {
  if (!contactsAvailable) return null;
  // Required here, not at the top: loading the module on a build without it would throw.
  const Contacts = require("expo-contacts") as typeof import("expo-contacts");
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) return { denied: true };
  const contact = await Contacts.Contact.presentPicker();
  if (!contact) return null;
  const name = (await contact.getFullName()).trim();
  return name ? { name } : null;
}
