/**
 * Connect flow, step 3 — the overall quote (route /flow/quote).
 *
 * Total cover and annual premium from the enrollments priced at connect
 * time. Each agent row expands into the frozen rate breakdown that produced
 * its premium (base rate, surcharges for skipped controls, loadings). Below
 * the rows, example configurations are priced LIVE through the same engine
 * (rate schedule per the programme's published ladder), including one that
 * is declined outright.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_COPY } from '../../data/copy';
import { SEED_CAP_USD } from '../../data/seed';
import { formatPct, formatUsd } from '../../lib/money';
import { priceAgent, type PricingResult } from '../../lib/pricing';
import { useStore } from '../../store';
import type { RateLine, Tier1Gate, Tier2Control } from '../../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../../store/types';
import {
  capUsdFor,
  coverageBExcluded,
  enrollmentRatePct,
} from '../purchase/enroll';
import { getSelectedAgentIds } from './flowState';

/** Illustrative configurations, priced live. Exported for the copy test. */
export const QUOTE_EXAMPLES: {
  key: string;
  label: string;
  tier2Off: Tier2Control[];
  gateOff?: Tier1Gate;
}[] = [
  { key: 'compliant', label: 'Every control in place', tier2Off: [] },
  { key: 'no-attestation', label: 'Without TEE attestation', tier2Off: ['attestation'] },
  { key: 'no-hitl', label: 'Without human approval above the threshold', tier2Off: ['hitl'] },
  {
    key: 'no-timelock-killswitch',
    label: 'Without timelock and kill switch',
    tier2Off: ['timelock', 'killSwitch'],
  },
  {
    key: 'ceiling',
    label: 'Every optional control skipped',
    tier2Off: [...TIER2_CONTROLS],
  },
  {
    key: 'declined',
    label: 'A required gate off',
    tier2Off: [],
    gateOff: 'actionLogging',
  },
];

const allOn = <K extends string>(keys: readonly K[]): Record<K, boolean> =>
  Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;

function RateBreakdownPanel({
  lines,
  totalPct,
  capUsd,
  premiumUsd,
  testId,
}: {
  lines: RateLine[];
  totalPct: number;
  capUsd: number;
  premiumUsd: number;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="border-t border-line-soft bg-canvas px-4 py-3">
      <ul className="flex flex-col gap-1.5">
        {lines.map((line, i) => (
          <li key={line.label} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 text-muted">
              {line.label}
              {line.coverageEffect !== undefined && (
                <span className="ml-1.5 inline-flex rounded border border-warn-line bg-warn-bg px-1.5 py-px text-2xs font-semibold text-warn">
                  {line.coverageEffect}
                </span>
              )}
            </span>
            <span className="num flex-none text-ink">
              {i === 0 ? '' : '+'}
              {formatPct(line.points)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-2 text-xs">
        <span className="font-semibold text-ink">{FLOW_COPY.totalRate}</span>
        <span className="num font-semibold text-ink">{formatPct(totalPct)}</span>
      </div>
      <div className="num mt-1 text-right text-2xs text-faint">
        {formatPct(totalPct)} × {formatUsd(capUsd)} = {formatUsd(premiumUsd)}
      </div>
    </div>
  );
}

export default function FlowQuote() {
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();
  const [expandedAgent, setExpandedAgent] = useState<string | undefined>();
  const [expandedExample, setExpandedExample] = useState<string | undefined>();

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);

  const rows = selected
    .map((id) => ({
      agent: agents.find((a) => a.id === id),
      enrollment: enrollments.find(
        (e) => e.agentId === id && e.terminatedAt === undefined,
      ),
    }))
    .filter(
      (r): r is { agent: NonNullable<typeof r.agent>; enrollment: NonNullable<typeof r.enrollment> } =>
        r.agent !== undefined && r.enrollment !== undefined,
    );

  const capUsd = Math.max(SEED_CAP_USD, ...selected.map((id) => capUsdFor(state, id)));

  const examples = useMemo(
    () =>
      QUOTE_EXAMPLES.map((ex) => {
        const tier1 = allOn(TIER1_GATES);
        if (ex.gateOff !== undefined) tier1[ex.gateOff] = false;
        const tier2 = allOn(TIER2_CONTROLS);
        for (const control of ex.tier2Off) tier2[control] = false;
        const result: PricingResult = priceAgent({
          capUsd,
          tier1,
          tier2,
          openSet: false,
          concentrationLoading: false,
        });
        return { ...ex, result };
      }),
    [capUsd],
  );

  if (selected.length === 0) return null;

  const totalCoverUsd = rows.reduce((a, r) => a + capUsdFor(state, r.agent.id), 0);
  const totalPremiumUsd = rows.reduce((a, r) => a + r.enrollment.premiumUsd, 0);

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowQuote">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {FLOW_COPY.quoteTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {FLOW_COPY.quoteSub} {FLOW_COPY.quoteHint}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="text-2xs font-bold uppercase tracking-widest text-faint">
            {FLOW_COPY.quoteTotalCover}
          </div>
          <div className="num mt-1 text-2xl font-bold text-ink" data-testid="quote-total-cover">
            {formatUsd(totalCoverUsd)}
          </div>
        </div>
        <div className="rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="text-2xs font-bold uppercase tracking-widest text-faint">
            {FLOW_COPY.quoteAnnualPremium}
          </div>
          <div className="num mt-1 text-2xl font-bold text-ink" data-testid="quote-total-premium">
            {formatUsd(totalPremiumUsd)}
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-panel shadow-card">
        <ul className="divide-y divide-line-soft">
          {rows.map(({ agent, enrollment }) => {
            const open = expandedAgent === agent.id;
            const totalPct = enrollmentRatePct(enrollment);
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  data-testid={`quote-row-${agent.id}`}
                  aria-expanded={open}
                  onClick={() => setExpandedAgent(open ? undefined : agent.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
                >
                  <span className="flex-none text-2xs text-faint">{open ? '▾' : '▸'}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink">
                    {agent.name}
                  </span>
                  {coverageBExcluded(enrollment) && (
                    <span className="inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                      {FLOW_COPY.quoteBExcluded}
                    </span>
                  )}
                  <span className="num text-xs text-muted">{totalPct}%</span>
                  <span className="num w-20 text-right text-sm font-semibold text-ink">
                    {formatUsd(enrollment.premiumUsd)}
                  </span>
                </button>
                {open && (
                  <RateBreakdownPanel
                    lines={[...enrollment.rateBreakdown, ...enrollment.loadings]}
                    totalPct={totalPct}
                    capUsd={capUsdFor(state, agent.id)}
                    premiumUsd={enrollment.premiumUsd}
                    testId={`quote-breakdown-${agent.id}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          data-testid="flow-quote-accept"
          onClick={() => navigate('/flow/pay')}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {FLOW_COPY.quoteAccept}
        </button>
      </div>

      <div className="mt-8" data-testid="quote-examples">
        <h2 className="text-md font-semibold text-ink">{FLOW_COPY.examplesTitle}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {FLOW_COPY.examplesSub(formatUsd(capUsd))}
        </p>
        <div className="mt-3 rounded-card border border-line bg-panel shadow-card">
          <ul className="divide-y divide-line-soft">
            {examples.map((ex) => {
              const open = expandedExample === ex.key;
              const quoted = ex.result.kind === 'quoted' ? ex.result : undefined;
              return (
                <li key={ex.key}>
                  <button
                    type="button"
                    data-testid={`example-row-${ex.key}`}
                    aria-expanded={open}
                    onClick={() => setExpandedExample(open ? undefined : ex.key)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
                  >
                    <span className="flex-none text-2xs text-faint">{open ? '▾' : '▸'}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                      {ex.label}
                    </span>
                    {quoted?.flags.coverageBExcluded && (
                      <span className="inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                        {FLOW_COPY.quoteBExcluded}
                      </span>
                    )}
                    {quoted !== undefined ? (
                      <>
                        <span className="num text-xs text-muted">{quoted.totalRatePct}%</span>
                        <span className="num w-20 text-right text-sm font-semibold text-ink">
                          {formatUsd(quoted.premiumUsd)}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                        {FLOW_COPY.exampleDeclined}
                      </span>
                    )}
                  </button>
                  {open &&
                    (quoted !== undefined ? (
                      <RateBreakdownPanel
                        lines={quoted.breakdown}
                        totalPct={quoted.totalRatePct}
                        capUsd={capUsd}
                        premiumUsd={quoted.premiumUsd}
                        testId={`example-breakdown-${ex.key}`}
                      />
                    ) : (
                      <div
                        data-testid={`example-breakdown-${ex.key}`}
                        className="border-t border-line-soft bg-canvas px-4 py-3 text-xs text-muted"
                      >
                        {FLOW_COPY.exampleDeclinedNote}
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
