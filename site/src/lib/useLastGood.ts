import { useState } from "react";
/** The latest non-null value (the last good window stays on screen while the next one loads or fails). */
export function useLastGood<T>(v: T | null): T | null {
  const [last, set] = useState<T | null>(v);
  if (v !== null && v !== last) set(v);
  return v ?? last;
}
