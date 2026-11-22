/** No contact picker in the browser preview. */
export const contactsAvailable = false;
export type PickResult = { name: string } | { denied: true } | null;
export async function pickContactName(): Promise<PickResult> {
  return null;
}
