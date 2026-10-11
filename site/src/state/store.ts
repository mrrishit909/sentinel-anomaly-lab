import { useRef, useSyncExternalStore } from "react";

/** A tiny external store: plain state + subscribe, read by the director every frame and by React via the hook. */
export function createStore<T extends object>(init: T) {
  let state = init;
  const listeners = new Set<() => void>();
  const get = () => state;
  const set = (p: Partial<T>) => {
    const next = { ...state, ...p };
    if ((Object.keys(p) as (keyof T)[]).every((k) => Object.is(next[k], state[k]))) return;
    state = next;
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
  const use = () => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use, reset: () => set(init) };
}

/** Subscribe to a slice of a store; re-renders only when the selected value changes (REPLAY's playhead ticks every frame). */
export function useSel<T extends object, S>(store: { get: () => T; subscribe: (l: () => void) => () => void }, sel: (s: T) => S): S {
  const last = useRef<{ s: T; v: S } | null>(null);
  const snap = () => {
    const s = store.get();
    if (last.current && last.current.s === s) return last.current.v;
    const v = sel(s);
    if (last.current && Object.is(last.current.v, v)) { last.current = { s, v: last.current.v }; return last.current.v; }
    last.current = { s, v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, snap, snap);
}
