/**
 * Connect flow, step 3 — the overall quote (route /flow/quote): total cover
 * across the connected agents and the annual premium, from the enrollments
 * priced at connect time.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_COPY } from '../../data/copy';
import { formatUsd } from '../../lib/money';
import { useStore } from '../../store';
import {
  capUsdFor,
  coverageBExcluded,
  enrollmentRatePct,
} from '../purchase/enroll';
import { getSelectedAgentIds } from './flowState';

export default function FlowQuote() {
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0) return null;

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

  const totalCoverUsd = rows.reduce((a, r) => a + capUsdFor(state, r.agent.id), 0);
  const totalPremiumUsd = rows.reduce((a, r) => a + r.enrollment.premiumUsd, 0);

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowQuote">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {FLOW_COPY.quoteTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{FLOW_COPY.quoteSub}</p>
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
          {rows.map(({ agent, enrollment }) => (
            <li
              key={agent.id}
              data-testid={`quote-row-${agent.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink">
                {agent.name}
              </span>
              {coverageBExcluded(enrollment) && (
                <span className="inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                  {FLOW_COPY.quoteBExcluded}
                </span>
              )}
              <span className="num text-xs text-muted">
                {enrollmentRatePct(enrollment)}%
              </span>
              <span className="num w-20 text-right text-sm font-semibold text-ink">
                {formatUsd(enrollment.premiumUsd)}
              </span>
            </li>
          ))}
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
    </div>
  );
}
