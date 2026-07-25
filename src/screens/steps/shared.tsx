/**
 * Shared chrome + formatting for the five claim steps (screen 7.11, WP-5).
 * Crumb, presenter-injected chip, the 5-step stepper, and the two-column
 * step grid per the postpurchase-claim-*.html mockups.
 */
import type { ReactNode } from 'react';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import type { Timestamp } from '../../store/types';

export const STEP_LABELS = [
  'Notify',
  'Contain',
  'Evidence package',
  'Clocks & decision',
  'Outcome',
] as const;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const p2 = (x: number) => String(x).padStart(2, '0');

/** "2026-07-21 09:47 UTC" */
export function fmtUtcDateTime(ts: Timestamp): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}

/** "09:47 UTC" */
export function fmtUtcTime(ts: Timestamp): string {
  const d = new Date(ts);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}

/** "09:49:12 UTC" */
export function fmtUtcTimeSec(ts: Timestamp): string {
  const d = new Date(ts);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
}

/** "21 Jul · 11:03 UTC" */
export function fmtUtcDayTime(ts: Timestamp): string {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}


/** "14 August 2026" */
export function fmtUtcDateLong(ts: Timestamp): string {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "37h 25m" (clamped at zero → "0h 0m"). */
export function fmtRemaining(ms: number): string {
  const clamped = Math.max(0, ms);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

/** "claim-3" → "C-2026-0003" — the display reference used across the flow. */
export function claimRef(claimId: string): string {
  const n = Number(claimId.replace(/^\D+/, '')) || 0;
  return `C-2026-${String(n).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export interface StepperProps {
  /** 1-based current step. */
  current: number;
}

export function ClaimStepper({ current }: StepperProps) {
  return (
    <div
      data-testid="claim-stepper"
      className="mb-6 flex overflow-x-auto rounded-card border border-line bg-panel shadow-card"
    >
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'cur' : 'todo';
        return (
          <div
            key={label}
            data-step-state={state}
            className={`flex flex-1 items-center gap-2.5 border-r border-line px-4 py-3 text-xs last:border-r-0 ${
              state === 'cur'
                ? 'bg-[#fbfdfc] font-semibold text-ink shadow-[inset_0_-2px_0_#00c988]'
                : state === 'done'
                  ? 'text-muted'
                  : 'text-faint'
            }`}
          >
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-2xs font-bold ${
                state === 'done'
                  ? 'border-good-line bg-good-bg text-good'
                  : state === 'cur'
                    ? 'border-accent bg-accent text-ink'
                    : 'border-line text-faint'
              }`}
            >
              {state === 'done' ? '✓' : n}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}

export interface ClaimChromeProps {
  crumbRef: string;
  crumb: string;
  subtitle: string;
  step: number;
  children: ReactNode;
}

/** Page head + stepper + step body. */
export function ClaimChrome({ crumbRef, crumb, subtitle, step, children }: ClaimChromeProps) {
  return (
    <div className="mx-auto max-w-shell px-6 py-7" data-testid="screen-Claim">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">
            Claim {crumbRef}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{crumb}</p>
          {subtitle !== '' && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-[#f6f8f7] px-2 py-0.5 text-2xs font-semibold text-faint">
          Incident record <SimulatedBadge />
        </span>
      </div>
      <ClaimStepper current={step} />
      {children}
    </div>
  );
}

/** Teaching callout ("? Why …"). */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-[#fbfcfb] px-4 py-3.5">
      <h4 className="mb-1 flex items-center gap-2 text-xs font-bold text-ink">
        <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
          ?
        </span>
        {title}
      </h4>
      <p className="text-xs text-muted">{children}</p>
    </div>
  );
}
