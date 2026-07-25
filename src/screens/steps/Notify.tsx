/**
 * Claim step 1 — Notify (screen 7.11, mockup postpurchase-claim-notify.html).
 * Injected narrative pre-fill, discovery timestamp, first loss transaction,
 * and the 48-hour rule rail (near-misses: 7 days).
 */
import { formatUsd } from '../../lib/money';
import {
  NEAR_MISS_NOTIFY_WINDOW_MS,
  NOTIFY_WINDOW_MS,
  phaseFromAnchors,
} from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { useStore } from '../../store';
import type { Claim, Incident } from '../../store/types';
import { fmtRemaining, fmtUtcDateTime, fmtUtcTime } from './shared';

export interface NotifyProps {
  claim: Claim;
  incident: Incident;
  onNext: () => void;
}

export default function Notify({ claim, incident, onNext }: NotifyProps) {
  const setClockState = useStore((s) => s.setClockState);

  const nearMiss = claim.clockState.nearMiss === true;
  const windowMs = nearMiss ? NEAR_MISS_NOTIFY_WINDOW_MS : NOTIFY_WINDOW_MS;
  const dueAt = incident.discoveredAt + windowMs;
  const remainingMs = dueAt - demoNow();
  const remainingPct = Math.max(0, Math.min(1, remainingMs / windowMs));
  const notified = claim.clockState.anchors.notifiedAt !== undefined;

  const notify = () => {
    if (!notified) {
      const anchors = { ...claim.clockState.anchors, notifiedAt: demoNow() };
      const next = { ...claim.clockState, anchors };
      setClockState(claim.id, { ...next, phase: phaseFromAnchors(next) });
    }
    onNext();
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]" data-testid="claim-step-notify">
      <div className="rounded-card border border-line bg-panel p-5 shadow-card">
        <h2 className="text-md font-bold text-ink">What happened?</h2>
        <p className="mt-3 rounded-lg border border-line bg-[#fafbfa] p-4 text-sm text-body">
          {incident.narrative}
        </p>
        <span className="mt-2 inline-flex items-center rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">
          Pre-filled from the incident record
        </span>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              Discovery timestamp
            </div>
            <div className="num mt-1 rounded-lg border border-line bg-[#fafbfa] px-3 py-2 font-mono text-sm text-ink">
              {fmtUtcDateTime(incident.discoveredAt)}
            </div>
            <p className="mt-1.5 text-2xs text-faint">
              Set from the first anomaly alert.
            </p>
          </div>
          <div>
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              First loss transaction
            </div>
            <div className="num mt-1 rounded-lg border border-line bg-[#fafbfa] px-3 py-2 font-mono text-sm text-ink">
              {incident.lossTxRefs.length > 0
                ? `${incident.lossTxRefs[0]} at ${fmtUtcTime(incident.eventAt)}`
                : 'none (no value moved)'}
            </div>
            <p className="mt-1.5 text-2xs text-faint">
              {incident.lossTxRefs.length > 0
                ? 'Auto-linked from your action log.'
                : `Investigation costs of ${formatUsd(incident.investigationCostUsd ?? 0)} recorded for the blocked attempt.`}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
          >
            Save draft
          </button>
          <button
            type="button"
            data-testid="notify-programme"
            onClick={notify}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
          >
            {notified ? 'Continue →' : 'Notify the programme →'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-line bg-panel p-4 shadow-card">
          <h3 className="text-sm font-bold text-ink">
            {nearMiss ? 'Notification window, 7 days' : 'Notification window, 48 hours'}
          </h3>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line-soft">
            <div
              className="h-full rounded-full bg-gradient-to-r from-good to-good"
              style={{ width: `${remainingPct * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-2xs text-muted">
            <span>Discovered {fmtUtcTime(incident.discoveredAt)}</span>
            <span className="num font-semibold text-ink" data-testid="notify-remaining">
              {fmtRemaining(remainingMs)} remaining
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
