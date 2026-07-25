/**
 * Connect flow, step 5 — coverage disclosures (route /flow/terms/:page).
 * One page per coverage, A through F. Each page states what the coverage
 * pays, its key condition, and the limit for each event, and must be agreed
 * to before the next page unlocks. Signing happens after page 6.
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { COVERAGE_CARDS, FLOW_COPY } from '../../data/copy';
import { perEventLimit } from '../../lib/claims';
import { formatUsd } from '../../lib/money';
import { SEED_CAP_USD } from '../../data/seed';
import { useStore } from '../../store';
import { capUsdFor } from '../purchase/enroll';
import { getAgreedPages, getSelectedAgentIds, markPageAgreed } from './flowState';

const PAGE_COUNT = 6;

export default function FlowTerms() {
  const { page: pageParam } = useParams();
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();

  const page = Number(pageParam);
  const validPage = Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT;
  // Pages unlock in order; deep links past the agreed point snap back.
  const maxAllowed = Math.min(getAgreedPages() + 1, PAGE_COUNT);

  useEffect(() => {
    if (selected.length === 0) {
      navigate('/', { replace: true });
    } else if (!validPage) {
      navigate('/flow/terms/1', { replace: true });
    } else if (page > maxAllowed) {
      navigate(`/flow/terms/${maxAllowed}`, { replace: true });
    }
  }, [selected.length, validPage, page, maxAllowed, navigate]);
  if (selected.length === 0 || !validPage || page > maxAllowed) return null;

  const card = COVERAGE_CARDS[page - 1];
  // All flow agents carry the same default cap today; the limit line shows
  // the per-agent figure at the largest cap among the connected agents.
  const capUsd = Math.max(
    SEED_CAP_USD,
    ...selected.map((id) => capUsdFor(state, id)),
  );
  const limitUsd = perEventLimit(card.route, capUsd);

  const agree = () => {
    markPageAgreed(page);
    if (page < PAGE_COUNT) navigate(`/flow/terms/${page + 1}`);
    else navigate('/flow/sign');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowTerms">
      <div className="mx-auto max-w-[680px]">
        <div className="text-2xs font-bold uppercase tracking-widest text-faint">
          {FLOW_COPY.termsProgress(page)}
        </div>
        <h1 className="mt-1 text-lg font-bold tracking-tight text-ink">
          Coverage {card.route}. {card.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{FLOW_COPY.termsSub}</p>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-line-soft">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${(page / PAGE_COUNT) * 100}%` }}
            role="progressbar"
            aria-valuenow={page}
            aria-valuemin={1}
            aria-valuemax={PAGE_COUNT}
          />
        </div>

        <div
          className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card"
          data-testid={`terms-page-${card.route}`}
        >
          <p className="text-sm text-body">{card.oneLiner}</p>

          <div className="mt-4">
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              {FLOW_COPY.termsWhatItPays}
            </div>
            <p className="mt-1 text-sm text-body">{card.whatItPays}</p>
          </div>

          <div className="mt-4">
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              {FLOW_COPY.termsKeyCondition}
            </div>
            <p className="mt-1 text-sm text-body">{card.keyCondition}</p>
          </div>

          <div className="mt-4">
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              {FLOW_COPY.termsLimit}
            </div>
            <p className="num mt-1 text-sm font-semibold text-ink">
              up to {formatUsd(limitUsd)} for each agent
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <button
              type="button"
              data-testid="terms-back"
              onClick={() => (page > 1 ? navigate(`/flow/terms/${page - 1}`) : navigate('/flow/pay'))}
              className="text-sm font-semibold text-muted"
            >
              Back
            </button>
            <button
              type="button"
              data-testid="terms-agree"
              onClick={agree}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
            >
              {FLOW_COPY.termsAgree}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
