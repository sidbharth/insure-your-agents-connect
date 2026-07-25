/**
 * CoverageCards (REQ-7.6.1, REQ-7.5.3, AC-3b): the six A–F cards,
 * display-only — no checkboxes anywhere. Coverage is derived, never
 * selected. A card can render greyed with its reason (Coverage B when
 * attestation is off). Frozen props — WP-2/3/4 consume.
 */
import { COVERAGE_CARDS, COVERAGE_PANEL_TOOLTIP } from '../data/copy';
import type { CoverageRoute } from '../store/types';

export interface CoverageCardState {
  route: CoverageRoute;
  /** false → greyed with `greyReason` (e.g. Coverage B, attestation off). */
  active: boolean;
  greyReason?: string;
  /** Optional bound policy numbers (post-purchase, 7.10). */
  perEventLimitUsd?: number;
}

export interface CoverageCardsProps {
  states: CoverageCardState[];
  /** Compact mini-card rendering for the wizard sidebar. */
  compact?: boolean;
  className?: string;
}

export function CoverageCards({ states, compact = false, className = '' }: CoverageCardsProps) {
  const byRoute = new Map(states.map((s) => [s.route, s]));

  return (
    <div className={className} data-testid="coverage-cards" title={COVERAGE_PANEL_TOOLTIP}>
      <div className={compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
        {COVERAGE_CARDS.map((card) => {
          const state = byRoute.get(card.route) ?? { route: card.route, active: true };
          return (
            <div
              key={card.route}
              data-testid={`coverage-card-${card.route}`}
              data-active={state.active}
              title={state.active ? card.oneLiner : state.greyReason}
              className={`rounded-card border shadow-card transition-opacity ${
                state.active
                  ? 'border-line bg-panel'
                  : 'border-line-soft bg-canvas opacity-55'
              } ${compact ? 'p-2' : 'p-3'}`}
            >
              <div className={compact ? 'flex min-w-0 flex-col items-start gap-1' : 'flex min-w-0 items-center gap-1.5'}>
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded text-2xs font-bold ${
                    state.active ? 'bg-accent-soft text-accent-ink' : 'bg-line-soft text-faint'
                  }`}
                >
                  {card.route}
                </span>
                <span
                  className={`min-w-0 break-words text-2xs font-semibold leading-snug ${state.active ? 'text-ink' : 'text-faint'}`}
                >
                  {compact ? card.shortTitle : card.title}
                </span>
              </div>
              {!compact && (
                <>
                  <p className="mt-1.5 text-xs text-muted">{card.oneLiner}</p>
                  <p className="mt-1 text-2xs text-faint">
                    <b>Key condition:</b> {card.keyCondition}
                  </p>
                </>
              )}
              {!state.active && state.greyReason && (
                compact ? (
                  <span
                    className="mt-1 inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad"
                    data-testid="grey-reason"
                  >
                    Excluded
                  </span>
                ) : (
                  <p className="mt-1 text-2xs font-semibold text-bad" data-testid="grey-reason">
                    {state.greyReason}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
