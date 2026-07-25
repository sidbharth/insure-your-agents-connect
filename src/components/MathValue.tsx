/**
 * MathValue — a money/rate figure that, when the global "Show the math"
 * toggle is on, expands into its complete arithmetic: inputs, formula,
 * clause references, and both currencies at the displayed rate
 * (REQ-6.7/6.8, decision D4, AC-14). Frozen props — WP-2..5 consume.
 */
import type { ReactNode } from 'react';
import { formatN, formatUsd, usdToN, type MathBreakdown } from '../lib/money';
import { useStore } from '../store';

export interface MathValueProps {
  /** The rendered figure, e.g. "$300/yr" or "0.6%". */
  children: ReactNode;
  /** The complete arithmetic behind the figure. */
  breakdown: MathBreakdown;
  /** Extra classes on the wrapping element. */
  className?: string;
}

export function MathValue({ children, breakdown, className }: MathValueProps) {
  const showMath = useStore((s) => s.showMath);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const rate = breakdown.rateUsed ?? usdPerN;

  return (
    <span className={className} data-testid="math-value">
      <span className="num">{children}</span>
      {showMath && (
        <span
          data-testid="math-expansion"
          className="mt-2 block max-w-[440px] overflow-hidden whitespace-normal rounded-lg border border-line bg-panel text-left text-xs font-normal shadow-card"
        >
          <span className="flex items-baseline justify-between gap-4 border-b border-line-soft bg-canvas px-3.5 py-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-muted">
              {breakdown.title ?? 'Calculation'}
            </span>

          </span>
          {(breakdown.inputs.length > 0 ||
            (breakdown.lines && breakdown.lines.length > 0)) && (
            <span className="block px-3.5 py-2">
              {breakdown.inputs.map((line, i) => (
                <span key={i} className="flex items-baseline justify-between gap-6 py-0.5">
                  <span className="text-muted">{line.label}</span>
                  <span className="num whitespace-nowrap text-right font-medium text-ink">
                    {line.amount}

                  </span>
                </span>
              ))}
              {breakdown.lines?.map((line, i) => (
                <span
                  key={`l-${i}`}
                  className="flex items-baseline justify-between gap-6 py-0.5"
                >
                  <span className="text-muted">{line.label}</span>
                  <span className="num whitespace-nowrap text-right font-medium text-ink">
                    {line.amount}

                  </span>
                </span>
              ))}
            </span>
          )}
          <span className="block border-t border-line-soft bg-canvas px-3.5 py-2 font-mono text-2xs leading-relaxed text-muted">
            {breakdown.formula}
          </span>
          {breakdown.resultUsd !== undefined && (
            <span className="flex items-baseline justify-between gap-4 border-t border-line px-3.5 py-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted">
                Result
              </span>
              <span className="num text-right font-semibold text-ink">
                {formatUsd(breakdown.resultUsd)} ≈{' '}
                {formatN(usdToN(breakdown.resultUsd, rate), { maxFractionDigits: 1 })}{' '}
                <span className="font-normal text-faint">at 1 $NEAR = ${rate.toFixed(2)}</span>
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
