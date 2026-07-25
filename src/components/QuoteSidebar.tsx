/**
 * QuoteSidebar (plan §1): the right-rail live quote preview shared by wizard
 * screens 7.3–7.5 — rate ladder + premium + coverage-card mini-states, fed by
 * a PricingResult. Collapses to red DECLINED when tier-1 gates are off
 * (REQ-7.5.1, AC-2). Frozen props — WP-2 consumes.
 */
import { formatN, formatPct, formatUsd, usdToN } from '../lib/money';
import type { PricingResult } from '../lib/pricing';
import { useStore } from '../store';
import { COVERAGE_B_GREY_REASON, TIER1_DECLINE_COPY } from '../data/copy';
import { CoverageCards, type CoverageCardState } from './CoverageCards';
import { PriceChipInline } from './helpers';
import { RateLadder } from './RateLadder';

export interface QuoteSidebarProps {
  result: PricingResult;
  capUsd: number;
  className?: string;
}

export function QuoteSidebar({ result, capUsd, className = '' }: QuoteSidebarProps) {
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);

  if (result.kind === 'declined') {
    const first = result.missingGates[0];
    return (
      <aside
        data-testid="quote-sidebar"
        data-state="declined"
        className={`rounded-card border border-bad-line bg-bad-bg p-5 shadow-card ${className}`}
      >
        <div className="text-lg font-bold text-bad">Declined</div>
        <p className="mt-2 text-sm text-bad" data-testid="decline-reason">
          {TIER1_DECLINE_COPY(first)}
        </p>
      </aside>
    );
  }

  const coverageStates: CoverageCardState[] = (
    ['A', 'B', 'C', 'D', 'E', 'F'] as const
  ).map((route) => ({
    route,
    active: route !== 'B' || !result.flags.coverageBExcluded,
    greyReason:
      route === 'B' && result.flags.coverageBExcluded ? COVERAGE_B_GREY_REASON : undefined,
  }));

  const ladderLines = result.breakdown.filter((l) => l.group === 'ladder');
  const loadingLines = result.breakdown.filter((l) => l.group === 'loading');

  return (
    <aside
      data-testid="quote-sidebar"
      data-state="quoted"
      className={`rounded-card border border-line bg-panel p-5 shadow-card ${className}`}
    >
      <div className="text-2xs font-bold uppercase tracking-widest text-muted">
        Live quote preview
      </div>

      <div className="num mt-2 text-xl font-bold text-ink">
        {formatPct(result.totalRatePct)}
        <span className="ml-2 text-sm font-normal text-muted">
          of a {formatUsd(capUsd)} cap
        </span>
      </div>

      <RateLadder
        ladder={ladderLines}
        loadings={loadingLines}
        ceilingReached={result.ceilingReached}
        heightPx={200}
        className="mt-3"
      />

      <div className="mt-4 border-t border-line-soft pt-3">
        <div className="num text-md font-bold text-ink" data-testid="sidebar-premium">
          {formatUsd(result.premiumUsd)}/yr ≈{' '}
          {formatN(usdToN(result.premiumUsd, usdPerN), { maxFractionDigits: 1 })}
        </div>
        <div className="mt-0.5 text-2xs text-faint">
          at <PriceChipInline />
        </div>
      </div>

      <CoverageCards states={coverageStates} compact className="mt-4" />
    </aside>
  );
}
