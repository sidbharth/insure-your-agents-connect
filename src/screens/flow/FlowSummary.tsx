/**
 * Cover summary (route /flow/summary) — the review page reached after the
 * walkthrough.
 *
 * One grid: every coverage down the side, every agent across the top, and
 * the amount each earns from its own settings. No separate base cover, no
 * rate ladder. Underneath it, the yearly price and a line naming how many
 * gaps are still open, because closing one raises cover and lowers price.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_TERMS, REVIEW_COPY } from '../../data/copy';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { useStore } from '../../store';
import { agentPriceUsd, COVER_LETTERS, evaluateCoverage } from './coverage';
import { getAgreedPages, getSelectedAgentIds } from './flowState';

export default function FlowSummary() {
  const agents = useStore((s) => s.agents);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
    else if (getAgreedPages() < COVER_LETTERS.length) {
      navigate(`/flow/review/${getAgreedPages() + 1}`, { replace: true });
    }
  }, [selected.length, navigate]);
  if (selected.length === 0 || getAgreedPages() < COVER_LETTERS.length) return null;

  const rows = selected
    .map((id) => ({ id, agent: agents.find((a) => a.id === id) }))
    .filter((r): r is { id: string; agent: NonNullable<typeof r.agent> } =>
      r.agent !== undefined,
    );

  const totalPriceUsd = rows.reduce((a, r) => a + agentPriceUsd(r.id).priceUsd, 0);
  const gaps = rows.reduce(
    (a, r) =>
      a + COVER_LETTERS.filter((l) => evaluateCoverage(r.id, l).status !== 'full').length,
    0,
  );
  const names = rows.map((r) => r.agent.name).join(', ');

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowSummary">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {REVIEW_COPY.summaryTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          {REVIEW_COPY.summarySub(names)}
        </p>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-panel shadow-card">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-2xs font-bold uppercase tracking-wider text-ink">
              <th className="px-4 py-2.5">{REVIEW_COPY.summaryCoverage}</th>
              {rows.map((r) => (
                <th key={r.id} className="px-4 py-2.5 text-right font-mono normal-case">
                  {r.agent.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-testid="summary-grid">
            {COVER_LETTERS.map((letter, i) => (
              <tr key={letter} className="border-b border-line-soft last:border-b-0">
                <td className="px-4 py-2.5 text-xs text-body">
                  <b className="text-ink">Coverage {letter}.</b> {FLOW_TERMS[i].title}
                </td>
                {rows.map((r) => {
                  const evaluation = evaluateCoverage(r.id, letter);
                  return (
                    <td
                      key={r.id}
                      className="px-4 py-2.5 text-right"
                      data-testid={`summary-${r.id}-${letter}`}
                    >
                      <span className="num block text-sm font-semibold text-ink">
                        {formatN(usdToN(evaluation.coverUsd, usdPerN), {
                          maxFractionDigits: 0,
                        })}
                      </span>
                      <span className="num block text-2xs text-ink">
                        {formatUsd(evaluation.coverUsd)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-panel p-5 shadow-card">
        <div>
          <div className="text-2xs font-bold uppercase tracking-widest text-ink">
            {REVIEW_COPY.summaryTotal}
          </div>
          <div className="mt-1" data-testid="summary-price">
            <div className="num text-2xl font-bold text-ink">
              {formatN(usdToN(totalPriceUsd, usdPerN), { maxFractionDigits: 0 })}
            </div>
            <div className="num text-xs text-ink">{formatUsd(totalPriceUsd)}</div>
          </div>
        </div>
        <p className="max-w-sm text-xs text-body" data-testid="summary-gaps">
          {gaps === 0 ? REVIEW_COPY.summaryClean : REVIEW_COPY.summaryGaps(gaps)}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          data-testid="summary-back"
          onClick={() => navigate(`/flow/review/${COVER_LETTERS.length}`)}
          className="text-sm font-semibold text-body"
        >
          {REVIEW_COPY.back}
        </button>
        <button
          type="button"
          data-testid="summary-accept"
          onClick={() => navigate('/flow/sign')}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {REVIEW_COPY.summaryAccept}
        </button>
      </div>
    </div>
  );
}
