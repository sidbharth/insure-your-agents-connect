/**
 * Connect flow, step 3 — the overall quote (route /flow/quote).
 *
 * Total cover and annual premium from the enrollments priced at connect
 * time. Each agent row expands into the frozen rate breakdown that produced
 * its premium (base rate, surcharges for skipped controls, loadings). The
 * connectable agents carry deliberately distinct control profiles, so the
 * rows themselves demonstrate the rate ladder.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_COPY } from '../../data/copy';
import { formatPct, formatUsd } from '../../lib/money';
import { useStore } from '../../store';
import type { RateLine } from '../../store/types';
import {
  capUsdFor,
  coverageBExcluded,
  enrollmentRatePct,
} from '../purchase/enroll';
import { getSelectedAgentIds, setSelectedAgentIds } from './flowState';

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

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);

  // Dropping an agent terminates its unpaid quote and returns the agent to
  // a clean state; the totals recompute from the remaining rows.
  const removeAgent = (agentId: string) => {
    const s = useStore.getState();
    s.deEnrollAgent(agentId);
    s.setAgentStatus(agentId, 'Draft');
    setExpandedAgent(undefined);
    setSelectedAgentIds(selected.filter((id) => id !== agentId));
    if (selected.length === 1) navigate('/');
  };

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
                  <>
                    <RateBreakdownPanel
                      lines={[...enrollment.rateBreakdown, ...enrollment.loadings]}
                      totalPct={totalPct}
                      capUsd={capUsdFor(state, agent.id)}
                      premiumUsd={enrollment.premiumUsd}
                      testId={`quote-breakdown-${agent.id}`}
                    />
                    <div className="flex justify-end border-t border-line-soft bg-canvas px-4 py-2.5">
                      <button
                        type="button"
                        data-testid={`quote-remove-${agent.id}`}
                        onClick={() => removeAgent(agent.id)}
                        className="text-2xs font-semibold text-bad"
                      >
                        {FLOW_COPY.quoteRemove}
                      </button>
                    </div>
                  </>
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
          onClick={() => navigate('/flow/terms/1')}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {FLOW_COPY.quoteAccept}
        </button>
      </div>
    </div>
  );
}
