import { useEffect, useSyncExternalStore } from "react";
import { getStore, type ArtifactSpec, type LoadState } from "./loader";
import { subscribeActive } from "../scroll/engine";

/**
 * Artifacts that are not on the S00 first-paint path wait behind a gate (MOTION_SYSTEM 9.3): the gate opens 3 s after load
 * (idle time during the intro) or as soon as the visitor leaves the first scene or jumps. S00's own files are prefetched
 * explicitly in App and S01Signal, so they never wait.
 */
let warm = false;
const waiting = new Set<() => void>();
const open = () => { if (warm) return; warm = true; waiting.forEach((f) => f()); waiting.clear(); };
if (typeof window !== "undefined") {
  window.setTimeout(open, 3000);
  addEventListener("sal:jump", open);
  subscribeActive(() => open());
}

/** Subscribe to an artifact and start loading it (behind the gate) on mount. Returns [state, retry]. */
export function useArtifact<T>(spec: ArtifactSpec<T>, autoload = true): [LoadState<T>, () => void] {
  const store = getStore(spec);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => {
    if (!autoload) return;
    if (warm) { store.prefetch(); return; }
    const go = () => store.prefetch();
    waiting.add(go);
    return () => void waiting.delete(go);
  }, [store, autoload]);
  return [state, store.load];
}
