import { useEffect, useState } from "react";
import { stageH, stageW, viewportClass, type Cls } from "./viewport";

export interface Stage { w: number; h: number; cls: Cls }
const read = (): Stage => ({ w: stageW(), h: stageH(), cls: viewportClass() });
/** The stage box (without classic scrollbars) and the matchMedia class, re-read on resize. */
export function useStage(): Stage {
  const [s, set] = useState(read);
  useEffect(() => {
    const on = () => set((o) => { const n = read(); return n.w === o.w && n.h === o.h && n.cls === o.cls ? o : n; });
    addEventListener("resize", on);
    on();
    return () => removeEventListener("resize", on);
  }, []);
  return s;
}
