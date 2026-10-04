// Minimal external store for the React overlay (plan §11.4). React subscribes with
// useSyncExternalStore; the engine publishes at most once per frame and only on change.

export interface Store<T extends object> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  /** Shallow-merges `partial`; notifies only if some value actually changed. */
  set(partial: Partial<T>): void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(partial) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      for (const l of listeners) l();
    },
  };
}
