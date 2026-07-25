/**
 * $/N formatting, conversion at a given rate, and the MathBreakdown type
 * that powers the global "Show the math" toggle (REQ-6.7/6.8, decision D2).
 * All computation is in USD; N is settlement display at an explicit rate.
 */

/** One input / intermediate line inside a "Show the math" expansion. */
export interface BreakdownLine {
  label: string;
  /** Pre-formatted amount/points text, e.g. "$50,000" or "+0.6%". */
  amount?: string;
  /** Framework clause reference, e.g. "5.5" or "Appendix 3". */
  clause?: string;
  note?: string;
}

/**
 * The complete arithmetic behind one displayed figure. UI never computes
 * money; engines return breakdowns and `MathValue` renders them (plan §1).
 */
export interface MathBreakdown {
  /** Optional short title, e.g. "Annual premium". */
  title?: string;
  /** The inputs that went in. */
  inputs: BreakdownLine[];
  /** The formula, human-readable, e.g. "0.6% × $50,000 = $300/yr". */
  formula: string;
  /** Primary framework clause for the figure. */
  clause?: string;
  /** Optional intermediate pipeline lines (quantum → limit → …). */
  lines?: BreakdownLine[];
  /** Result in USD (computational currency). */
  resultUsd?: number;
  /** USD-per-N rate used for the N figure, with its provenance shown by PriceChip. */
  rateUsed?: number;
}

/** Convert USD to N at an explicit rate. */
export function usdToN(usd: number, usdPerN: number): number {
  return usd / usdPerN;
}


export interface FormatOptions {
  /** Max fraction digits (default 0 for USD, 0 for N when integral else 2). */
  maxFractionDigits?: number;
  /** Show explicit sign for positive values (deltas). */
  signed?: boolean;
}

/** "$4,150" / "+$37" / "$18,500.50". */
export function formatUsd(usd: number, opts: FormatOptions = {}): string {
  const { maxFractionDigits = Number.isInteger(usd) ? 0 : 2, signed = false } = opts;
  const abs = Math.abs(usd).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
  const sign = usd < 0 ? '−' : signed ? '+' : '';
  return `${sign}$${abs}`;
}

/** "1,383 $NEAR" / "≈ 12.3 $NEAR". */
export function formatN(n: number, opts: FormatOptions = {}): string {
  const { maxFractionDigits = Number.isInteger(n) ? 0 : 1, signed = false } = opts;
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
  const sign = n < 0 ? '−' : signed ? '+' : '';
  return `${sign}${abs} $NEAR`;
}

/** "0.6%" / "+0.1%" — rate points formatting with tabular styling upstream. */
export function formatPct(points: number, opts: FormatOptions = {}): string {
  const { signed = false } = opts;
  const sign = points < 0 ? '−' : signed ? '+' : '';
  return `${sign}${Math.abs(points).toFixed(1)}%`;
}

/** "1 $NEAR = $3.00" style rate rendering. */
export function formatRate(usdPerN: number): string {
  return `1 $NEAR = $${usdPerN.toFixed(2)}`;
}

/** "14:31:07" clock text for price-chip timestamps. */
export function formatClockTime(ts: number): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
