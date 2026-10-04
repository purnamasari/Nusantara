// Quantisation report (plan §5.4): runs the runtime's own smoothing on the float grid and on
// the decoded integer grid and compares them in game units.

import { smoothPass } from '../src/terrain/pipeline.ts';

export interface QuantizationReport {
  stepM: number;
  maxErrGameM: number;
  rmsErrGameM: number;
  terraceCellsPct: number;
}

function slopesDeg(a: Float64Array, n: number, spacing: number): Float64Array {
  const out = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const l = a[r * n + Math.max(0, c - 1)]!;
      const rr = a[r * n + Math.min(n - 1, c + 1)]!;
      const u = a[Math.max(0, r - 1) * n + c]!;
      const d = a[Math.min(n - 1, r + 1) * n + c]!;
      const gx = (rr - l) / (2 * spacing);
      const gz = (d - u) / (2 * spacing);
      out[r * n + c] = (Math.atan(Math.sqrt(gx * gx + gz * gz)) * 180) / Math.PI;
    }
  }
  return out;
}

export function quantizationReport(
  metres: Float64Array,
  quantized: Float64Array,
  min: number,
  max: number,
  levels: number,
  n: number,
  spacing: number,
  verticalScale: number,
  smoothPasses: number,
): QuantizationReport {
  const f = new Float64Array(n * n);
  const q = new Float64Array(n * n);
  for (let i = 0; i < f.length; i++) {
    f[i] = (metres[i]! - min) * verticalScale;
    q[i] = (quantized[i]! - min) * verticalScale;
  }
  const tmp = new Float64Array(n * n);
  for (let p = 0; p < smoothPasses; p++) {
    smoothPass(f, n, tmp);
    smoothPass(q, n, tmp);
  }
  let maxErr = 0;
  let sumSq = 0;
  for (let i = 0; i < f.length; i++) {
    const d = Math.abs(f[i]! - q[i]!);
    if (d > maxErr) maxErr = d;
    sumSq += d * d;
  }
  const sf = slopesDeg(f, n, spacing);
  const sq = slopesDeg(q, n, spacing);
  let gentle = 0;
  let terraced = 0;
  for (let i = 0; i < sf.length; i++) {
    if (sf[i]! < 3) {
      gentle++;
      if (Math.abs(sq[i]! - sf[i]!) > 2) terraced++;
    }
  }
  return {
    stepM: (max - min) / levels,
    maxErrGameM: maxErr,
    rmsErrGameM: Math.sqrt(sumSq / f.length),
    terraceCellsPct: gentle > 0 ? (terraced / gentle) * 100 : 0,
  };
}

/** §5.4 switching criteria 1, 2 and 4 (criterion 3 is a human visual review). */
export function quantizationFailures(r: QuantizationReport, verticalScale: number, smoothPasses: number): string[] {
  const out: string[] = [];
  if (r.maxErrGameM > 0.3) out.push(`max error ${r.maxErrGameM.toFixed(3)} m > 0.30 m`);
  if (r.rmsErrGameM > 0.1) out.push(`RMS error ${r.rmsErrGameM.toFixed(3)} m > 0.10 m`);
  if (r.terraceCellsPct > 5) out.push(`terrace cells ${r.terraceCellsPct.toFixed(2)}% > 5%`);
  if (r.stepM * verticalScale > 0.5 && smoothPasses < 2) out.push('step × verticalScale > 0.5 m with fewer than 2 smoothing passes');
  return out;
}
