/** The pretend server exists only in the browser preview (server.web.ts). */
export async function demoRequest(_path: string, _init?: RequestInit): Promise<unknown> {
  throw new Error("demo server is web-only");
}
export function resetDemo() {}
