/** Decoding of the published encodings (DATA_CONTRACTS "Encodings"): little-endian uint16 and uint8 base64, log-quantized scores. */
export const Q_MAX = 65535;

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64ToU16(s: string): Uint16Array {
  const b = b64ToBytes(s);
  const out = new Uint16Array(b.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = b[2 * i]! | (b[2 * i + 1]! << 8); // explicit LE: no host-endian assumption
  return out;
}
export const b64ToU8 = b64ToBytes;

/** raw score = c * expm1(q / 65535 * smax) */
export const qToScore = (q: number, quant: { c: number; smax: number }) => quant.c * Math.expm1((q / Q_MAX) * quant.smax);
/** v = lo + (q / 65535) * (hi - lo) */
export function decodeChannel(q: Uint16Array, range: readonly [number, number]): Float64Array {
  const [lo, hi] = range;
  const out = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = lo + (q[i]! / Q_MAX) * (hi - lo);
  return out;
}
