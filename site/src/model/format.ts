export const d1 = (v: number) => v.toFixed(1);
export const d2 = (v: number) => v.toFixed(2);
export const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
export const pct0 = (v: number) => `${Math.round(v * 100)}%`;
export const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** Integer in English words (0 to 999). `words(200)` = "two hundred". */
export function words(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
