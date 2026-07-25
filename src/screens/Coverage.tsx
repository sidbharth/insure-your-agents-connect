/**
 * Screen 7.10 — Current policy coverage (post-purchase detail) + the
 * Scenario Explorer entry point. WP-4.
 *
 * The six coverage cards and the exclusion wall from screen 7.6 return,
 * now bound to real policy numbers: this agent's cap, sublimits computed
 * in dollars via the claims engine's per-event-limit rule, N equivalents
 * under "Show the math". Works pre-purchase too (linked from 7.6): with no
 * enrollment the cards show quote-stage numbers from the default mandate.
 *
 * `/coverage?view=scenarios` renders the Scenario Explorer (route list is
 * WP-0-frozen, so the explorer lives under the /coverage route).
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CoverageCards, type CoverageCardState } from '../components/CoverageCards';
import { ExclusionWall } from '../components/ExclusionWall';
import { MathValue } from '../components/MathValue';
import { COVERAGE_B_GREY_REASON, COVERAGE_CARDS } from '../data/copy';
import { SEED_CAP_USD } from '../data/seed';
import { intervalCovers } from '../lib/conditions';
import { perEventLimit } from '../lib/claims';
import { demoNow } from '../lib/demoClock';
import { formatUsd } from '../lib/money';
import { useStore } from '../store';
import type { CoverageRoute } from '../store/types';
import { fmtDate, newestMandate } from './portfolio/helpers';
import ScenarioExplorer from './ScenarioExplorer';

const ROUTES: CoverageRoute[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const LIMIT_LABEL: Record<CoverageRoute, string> = {
  A: '100% of cap',
  B: '100% of cap',
  C: '100% of cap',
  D: '100% of cap',
  E: '50% of cap',
  F: '15% of cap',
};

export default function Coverage() {
  const [params] = useSearchParams();
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const mandates = useStore((s) => s.mandates);
  useStore((s) => s.presenter.timeOffsetMs);

  const now = demoNow();

  // Post-purchase: bind to a real policy (?agent=… or the first live
  // enrollment). Pre-purchase (no enrollment): quote-stage numbers. An unpaid
  // quote (effectiveAt still 0, stamped only at payment) is not a policy yet.
  const requestedAgentId = params.get('agent') ?? undefined;
  const liveEnrollments = enrollments.filter(
    (e) => e.terminatedAt === undefined && e.effectiveAt !== 0,
  );
  const enrollment =
    liveEnrollments.find((e) => e.agentId === requestedAgentId) ??
    liveEnrollments[0];
  const agent = agents.find((a) => a.id === (enrollment?.agentId ?? requestedAgentId));
  const mandate = agent ? newestMandate(mandates[agent.id]) : undefined;
  const capUsd = mandate?.caps.perTx ?? SEED_CAP_USD;
  const postPurchase = enrollment !== undefined;

  const attestationOperative =
    agent === undefined
      ? true
      : intervalCovers(agent.controlsHistory.attestation, now);

  const cardStates: CoverageCardState[] = useMemo(
    () =>
      ROUTES.map((route) => ({
        route,
        active: route !== 'B' || attestationOperative,
        greyReason: route === 'B' && !attestationOperative ? COVERAGE_B_GREY_REASON : undefined,
        perEventLimitUsd: perEventLimit(route, capUsd),
      })),
    [attestationOperative, capUsd],
  );

  if (params.get('view') === 'scenarios') {
    return <ScenarioExplorer />;
  }

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Coverage">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg">
            Policy coverage
            {postPurchase && agent && (
              <span className="font-normal text-muted"> for {agent.name}</span>
            )}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Six coverages, A through F, apply to{' '}
            {postPurchase ? 'this agent’s' : 'the quoted'}{' '}
            <b className="num text-ink">{formatUsd(capUsd)}</b> cap. Active
            coverages follow from the controls in place.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {postPurchase && enrollment ? (
            <span
              data-testid="coverage-active-since"
              className="rounded-md border border-good-line bg-good-bg px-2.5 py-1 text-2xs font-semibold text-good"
            >
              Active since {fmtDate(enrollment.effectiveAt)}
            </span>
          ) : (
            <span
              data-testid="coverage-quote-stage"
              className="rounded-md border border-line bg-canvas px-2.5 py-1 text-2xs font-semibold text-muted"
            >
              Amounts shown at the quoted cap
            </span>
          )}
          <Link
            to="/coverage?view=scenarios"
            data-testid="test-a-scenario"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
          >
            Test a scenario
          </Link>
        </div>
      </div>

      {/* limits picture, bound to the real cap */}
      <div
        data-testid="limits-picture"
        className="mb-4 rounded-card border border-line bg-panel px-5 py-4 shadow-card"
      >
        <div className="text-2xs font-bold uppercase tracking-widest text-faint">
          Per-event limits
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['A', 'E', 'F'] as CoverageRoute[]).map((route) => (
            <div key={route} className="text-sm text-body">
              <span className="text-muted">
                {route === 'A' ? 'A–D per event' : `${route} per event`}{' '}
                ({LIMIT_LABEL[route]})
              </span>{' '}
              <MathValue
                breakdown={{
                  title: `Per-event limit, route ${route === 'A' ? 'A–D' : route}`,
                  inputs: [
                    { label: 'Per-agent cap', amount: formatUsd(capUsd) },
                    { label: 'Limit fraction', amount: LIMIT_LABEL[route] },
                  ],
                  formula: `${LIMIT_LABEL[route]} × ${formatUsd(capUsd)} = ${formatUsd(perEventLimit(route, capUsd))}`,
                  clause: '7.6 limits',
                  resultUsd: perEventLimit(route, capUsd),
                }}
              >
                <b className="text-ink">{formatUsd(perEventLimit(route, capUsd))}</b>
              </MathValue>
            </div>
          ))}
        </div>
        <p className="mt-2 border-t border-line-soft pt-2 text-2xs text-faint">
          Sublimits apply within the per-event limit. Recovery
          and bounty costs inside Coverage F are capped at 10% of the cap
          ({formatUsd(0.1 * capUsd)}). One aggregate applies, and a single
          incident pays once. The retention per event is the{' '}
          <b className="num text-muted">greater of 500 $NEAR or 2% of the loss</b>,
          and it is never prepaid.
        </p>
      </div>

      {/* the six cards + bound dollar sublimits */}
      <CoverageCards states={cardStates} className="mb-2" />
      <div
        data-testid="coverage-sublimits"
        className="mb-4 rounded-card border border-line bg-panel px-5 py-3 shadow-card"
      >
        <div className="text-2xs font-bold uppercase tracking-widest text-faint">
          Per-event limits at {postPurchase ? 'this policy’s' : 'the quoted'} cap
        </div>
        <ul className="mt-1 divide-y divide-line-soft">
          {ROUTES.map((route) => {
            const card = COVERAGE_CARDS.find((c) => c.route === route);
            const limit = perEventLimit(route, capUsd);
            return (
              <li
                key={route}
                data-testid={`sublimit-${route}`}
                className="flex items-center justify-between gap-4 py-1.5 text-sm"
              >
                <span className="text-muted">
                  <b className="text-ink">Coverage {route}</b>: {card?.title}
                </span>
                <MathValue
                  breakdown={{
                    title: `Coverage ${route} per-event limit`,
                    inputs: [
                      { label: 'Per-agent cap', amount: formatUsd(capUsd) },
                      { label: 'Limit fraction', amount: LIMIT_LABEL[route] },
                    ],
                    formula: `${LIMIT_LABEL[route]} × ${formatUsd(capUsd)} = ${formatUsd(limit)}`,
                    clause: '7.6 limits',
                    resultUsd: limit,
                  }}
                >
                  <b className="text-ink">up to {formatUsd(limit)}</b>{' '}
                  <span className="text-2xs text-faint">({LIMIT_LABEL[route]})</span>
                </MathValue>
              </li>
            );
          })}
        </ul>
      </div>

      {/* the exclusion wall returns (REQ-7.6.2) */}
      <ExclusionWall />
    </div>
  );
}
