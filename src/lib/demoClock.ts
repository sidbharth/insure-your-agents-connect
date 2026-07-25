/**
 * Virtual demo clock (plan §1, §12).
 *
 * `demoNow()` = real now + the presenter's time offset. ALL time-dependent
 * logic (activation, event, discovery, claim clocks, renewal, pro-rata)
 * must read this clock — never `Date.now()` / `new Date()` directly — so the
 * presenter's fast-forward is real state, not decoration (REQ-7.11.2).
 *
 * This file is the ONLY sanctioned reader of the real clock; an ESLint
 * restricted-syntax rule enforces that everywhere else.
 */
import type { Timestamp } from '../store/types';

let offsetProvider: () => number = () => 0;

/** Called once by the store assembly to wire the presenter time offset in. */
export function registerOffsetProvider(fn: () => number): void {
  offsetProvider = fn;
}

/** Virtual "now" in ms: real now + presenter offset. */
export function demoNow(): Timestamp {
  return Date.now() + offsetProvider();
}

/** Virtual "now" as a Date. */
export function demoNowDate(): Date {
  return new Date(demoNow());
}

