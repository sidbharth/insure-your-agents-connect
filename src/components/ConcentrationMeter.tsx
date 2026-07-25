/**
 * ConcentrationMeter (REQ-7.7.2, GT-6): shared-component share of the
 * (simulated) programme book vs the 40% threshold. Frozen props — WP-3/4
 * consume.
 */
import { SimulatedBadge } from './SimulatedBadge';

export interface ConcentrationMeterProps {
  /** Component label, e.g. "IronClaw v2.3". */
  component: string;
  /** Current share of the book, 0..1. */
  share: number;
  /** Threshold, 0..1 (0.40 per clause 5.8.2). */
  threshold?: number;
  className?: string;
}

export function ConcentrationMeter({
  component,
  share,
  threshold = 0.4,
  className = '',
}: ConcentrationMeterProps) {
  const over = share > threshold;
  const pct = Math.min(1, share) * 100;

  return (
    <div data-testid="concentration-meter" className={className}>
      <div className="mb-0.5 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">
          {component} concentration
        </span>
        <b
          className={`num text-md ${over ? 'text-warn' : 'text-ink'}`}
          data-testid="share-readout"
        >
          {(share * 100).toFixed(1)}%
        </b>
      </div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-xs text-muted">
          Share of programme-wide insured caps
        </span>
        <SimulatedBadge />
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-warn-deep' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-bad"
          style={{ left: `${threshold * 100}%` }}
          title={`${threshold * 100}% concentration threshold (5.8.2)`}
        />
      </div>
      <p className="mt-1.5 text-xs text-body">
        Enrollments made while the share exceeds {(threshold * 100).toFixed(0)}%
        carry a +0.1% loading.
      </p>
      {over && (
        <div
          className="mt-1.5 rounded-md border border-warn-line bg-warn-bg px-2.5 py-1.5 text-xs font-semibold text-warn"
          data-testid="over-threshold"
        >
          Above threshold: new {component} enrollments carry the +0.1% loading.
        </div>
      )}
    </div>
  );
}
