/**
 * QA L1: the viewport class comes from matchMedia, the same source the CSS breakpoints use (never clientWidth,
 * which shrinks by the classic scrollbar). The canvas box is measured separately with clientWidth.
 *   M < 768, T 768-1023, C (compact desktop) 1024-1279, D >= 1280.
 */
export type Cls = "M" | "T" | "C" | "D";
const q = (s: string) => (typeof matchMedia === "undefined" ? null : matchMedia(s));
const mM = q("(max-width: 767px)"), mT = q("(max-width: 1023px)"), mC = q("(max-width: 1279px)");
export const viewportClass = (): Cls => (mM?.matches ? "M" : mT?.matches ? "T" : mC?.matches ? "C" : "D");
/** The stage box: the viewport without classic scrollbars. */
export const stageW = () => document.documentElement.clientWidth;
export const stageH = () => window.innerHeight;
/** CSS-side class, read independently for the L1 test. */
export const cssClass = (): Cls => viewportClass();
