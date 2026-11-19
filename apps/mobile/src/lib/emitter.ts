/** Tiny typed event emitter for app-wide signals (no dependency needed). */
export function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T) {
      listeners.forEach((l) => l(value));
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
