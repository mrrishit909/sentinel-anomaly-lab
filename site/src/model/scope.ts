/**
 * Scope guard (VISUAL_DESIGN 3.4 REPLAY "Cross-filter contract"): every rendered metric belongs to exactly one scope.
 * SPLIT numbers come from the precomputed sweep and detector_eval; WINDOW numbers are recomputed in the browser from
 * stored window scores. A ledger cell never holds both.
 */
export type Scope = "SPLIT" | "WINDOW";
export interface Cell { key: string; label: string; value: string; scope: Scope; title?: string }
export const scopeOf = (cell: Cell): Scope => cell.scope;

export const splitCaption = (split: "val" | "test", days: string, segments: number) =>
  `${split.toUpperCase()} SPLIT · ${days} DAYS · ${segments} INCIDENTS`;
export const windowCaption = (n: number) => `THIS WINDOW · ${n.toLocaleString("en-US")} S · RECOMPUTED IN YOUR BROWSER`;
