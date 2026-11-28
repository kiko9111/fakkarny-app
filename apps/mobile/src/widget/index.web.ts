/** No home-screen widget in the browser preview. */
export const widgetAvailable = false;
export async function refreshWidget(): Promise<void> {}
export function clearWidget(): void {}
export function startWidget(_say: (text: string) => void): void {}
export function widgetsPlaced(): number {
  return 0;
}
export function pinWidget(): boolean {
  return false;
}
