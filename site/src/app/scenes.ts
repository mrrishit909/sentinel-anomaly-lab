/**
 * Scene registry (VISUAL_DESIGN 3.1, landing progress from MOTION_SYSTEM 6.2). `signal` (S00 intro + S01) is static
 * HTML in index.html so the LCP headline paints before JS. S08 has no nav item: the nav keeps REPLAY active.
 * The "58 DAYS" label is bound to facts.days at build time (window.__PROV), never typed.
 */
export interface SceneDef { id: string; code: string; nav: string | null; track: string; landing: number; title: string }

declare global { interface Window { __PROV?: { days: number; channels: number; nature: string; incident: string } } }
const days = typeof window !== "undefined" && window.__PROV ? Math.round(window.__PROV.days) : 58;

export const SCENES: SceneDef[] = [
  { id: "signal", code: "S01", nav: "SIGNAL", track: "200vh", landing: 0.78, title: "Find the signal inside the noise." },
  { id: "record", code: "S02", nav: "SOURCE", track: "300vh", landing: 0.14, title: "A simulated machine with injected faults." },
  { id: "normal", code: "S03a", nav: "NORMAL", track: "250vh", landing: 0.55, title: "Normal has a shape." },
  { id: "detectors", code: "S03b", nav: "DETECTORS", track: "250vh", landing: 0.33, title: "Five ways to be suspicious." },
  { id: "days", code: "S04", nav: `${days} DAYS`, track: "300vh", landing: 0.8, title: "Fifty-eight days. Two hundred faults." },
  { id: "lab", code: "S05", nav: "THRESHOLD", track: "250vh", landing: 0.4, title: "Move the line." },
  { id: "fine", code: "S06", nav: "FINE PRINT", track: "300vh", landing: 0.31, title: "One touch paints the whole fault." },
  { id: "evidence", code: "S07", nav: "EVIDENCE", track: "250vh", landing: 0.05, title: "How we know." },
  { id: "replay", code: "REPLAY", nav: "REPLAY", track: "auto", landing: 0, title: "Replay a fault. Choose who is watching." },
  { id: "close", code: "S08", nav: null, track: "200vh", landing: 0.3, title: "The signal, found again." },
];
export const NAV_ITEMS = SCENES.filter((s) => s.nav).map((s) => ({ id: s.id, label: s.nav! }));
/** S08 keeps REPLAY active in the nav. */
export const navActive = (scene: string | null) => (scene === "close" ? "replay" : scene ?? "signal");
