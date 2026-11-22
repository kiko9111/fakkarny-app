// The browser has its own localStorage. Some embedded previews block it: fall back to memory.
try {
  const probe = "__zaki_probe__";
  globalThis.localStorage.setItem(probe, "1");
  globalThis.localStorage.removeItem(probe);
} catch {
  const mem = new Map<string, string>();
  const shim = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  try {
    Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
  } catch {
    // nothing else to try
  }
}
