/**
 * The lens frame model. A frame is a plain description of what one canvas draws: strands, a lens, marks.
 * There is no angle anywhere: the lens translates, resizes and magnifies, and never rotates (MOTION_SYSTEM 2).
 */
export interface LensState {
  cx: number; cy: number; R: number;
  /** time magnification inside the lens relative to the outside scale */
  Mt: number;
  /** amplitude magnification inside the lens */
  Ma: number;
  /** focus second: the strand time shown at the lens centre */
  f: number;
  /** glass tint opacity (0 to 0.065) and ridge-fill strength (0 to 1) */
  glass: number; ridge: number;
}
/** A lit span: seconds in strand time, intensity by rank (0..1) and growth g (0..1: the fill grows from the reference to the measured path) */
export interface Lit { t0: number; t1: number; k: number; g?: number }
export interface Strand {
  id: string;
  y: number;
  vals: ArrayLike<number>;
  /** seconds per sample and the time of sample 0 */
  dt: number; t0: number;
  /** px per value unit outside the lens; inside it is multiplied by lens.Ma */
  amp: number;
  /** outside opacity and inside opacity */
  alpha: number; ink: number;
  dashed?: boolean;
  /** ridge fill and occlusion inside the lens (telemetry and score strands, not context) */
  ridge?: boolean;
  /** vertical room under the baseline the ridge fill covers (px) */
  ridgeH?: number;
  expected?: ArrayLike<number> | null;
  /** seconds range in which the expected path is drawn (WARMING UP before the first 60 s; reveal left to right) */
  expectedRange?: [number, number];
  lit?: Lit[];
  /** the lit residual is the region between vals and this reference (expected array, or a constant such as a hairline) */
  litRef?: ArrayLike<number> | number;
  hairline?: number;
  hairlineAlpha?: number;
  skip?: [number, number];
  /** draw only samples inside this time range */
  only?: [number, number];
  /** draw a DOM label for this strand (the label itself is DOM, QA L13) */
  label?: boolean;
  labelLit?: boolean;
  /** label text when it differs from the id (score strands use short detector codes) */
  text?: string;
}
export type Mark =
  | { kind: "bar"; t0: number; t1: number; y: number; h: number; color: string; alpha?: number; hollow?: boolean; insideOnly?: boolean }
  | { kind: "tick"; t: number; y: number; h: number; w: number; color: string; alpha?: number; hollow?: boolean }
  | { kind: "square"; t: number; y: number; s: number; color: string }
  | { kind: "vline"; t: number; y0: number; y1: number; color: string; alpha?: number; w?: number };
export interface Strip { x: number; y: number; w: number; h: number; bins: ArrayLike<number>; thr: number; frac?: ArrayLike<number>; spans: { b0: number; b1: number; caught: boolean }[]; alpha: number }
/** A DOM label positioned from frame geometry (all text is DOM, QA L13). */
export interface Tag { key: string; text: string; x: number; y: number; align?: "l" | "c" | "r"; tone?: "mute" | "alarm" | "thresh" | "ink" }
export interface Frame {
  w: number; h: number;
  tx: { x0: number; pxPerS: number };
  lens: LensState | null;
  strands: Strand[];
  marks: Mark[];
  /** the record writes: only x <= writeX is drawn */
  writeX?: number;
  alpha?: number;
  glow: number;
  /** a white alert bar across the lens top for detectors that do not rank measurements */
  topBar?: { t0: number; t1: number }[];
  strip?: Strip;
  tags?: Tag[];
}
export interface LabelBox { id: string; x: number; y: number }

export const INK = "#ffffff";
export const ALARM = "#FF4C25";
export const HIGHLIGHT = "#FFC23D";
export const THRESH = "#58B8E1";
