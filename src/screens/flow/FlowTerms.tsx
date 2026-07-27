/**
 * Connect flow, step 5 — coverage disclosures (route /flow/terms/:page).
 * One page per coverage, A through F, written for informed consent: what is
 * covered, what is not covered, and how payment works, with a per-page
 * acknowledgment checkbox gating the agreement. Signing happens after
 * page 6.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FLOW_COPY, FLOW_TERMS } from '../../data/copy';
import { perEventLimit } from '../../lib/claims';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { SEED_CAP_USD } from '../../data/seed';
import { useStore } from '../../store';
import { capUsdFor } from '../purchase/enroll';
import { getAgreedPages, getSelectedAgentIds, markPageAgreed } from './flowState';

const PAGE_COUNT = 6;

export default function FlowTerms() {
  const { page: pageParam } = useParams();
  const agents = useStore((s) => s.agents);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();
  const [acknowledged, setAcknowledged] = useState(false);

  const page = Number(pageParam);
  const validPage = Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT;
  // Pages unlock in order; deep links past the agreed point snap back.
  const maxAllowed = Math.min(getAgreedPages() + 1, PAGE_COUNT);

  // Each page requires its own affirmative acknowledgment.
  useEffect(() => {
    setAcknowledged(false);
  }, [page]);

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

  const terms = FLOW_TERMS[page - 1];
  // All flow agents carry the same default cap today; the limit line shows
  // the per-agent figure at the largest cap among the connected agents.
  const capUsd = Math.max(
    SEED_CAP_USD,
    ...selected.map((id) => capUsdFor(state, id)),
  );
  const limitUsd = perEventLimit(terms.route, capUsd);

  const agree = () => {
    if (!acknowledged) return;
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
          Coverage {terms.route}. {terms.title}
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
          data-testid={`terms-page-${terms.route}`}
        >
          <div
            className="mb-4 rounded-lg border border-line bg-canvas px-4 py-3"
            data-testid="terms-who"
          >
            <div className="text-2xs font-bold uppercase tracking-wider text-ink">
              {FLOW_COPY.termsWhoTitle}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.map((id) => {
                const agent = agents.find((a) => a.id === id);
                if (agent === undefined) return null;
                const excluded =
                  terms.route === 'B' && !agent.controls.tier2.attestation;
                return (
                  <span
                    key={id}
                    data-testid={`terms-who-${id}`}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-2xs font-semibold ${
                      excluded
                        ? 'border-bad-line bg-bad-bg text-bad'
                        : 'border-good-line bg-good-bg text-good'
                    }`}
                  >
                    {agent.name}
                    {excluded && (
                      <span className="font-sans font-semibold">
                        {FLOW_COPY.coverMapExcluded}, {FLOW_COPY.termsWhoExcludedReason}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-body">{terms.intro}</p>

          <div className="mt-5">
            <div className="text-2xs font-bold uppercase tracking-wider text-good">
              {FLOW_COPY.termsCovered}
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {terms.covered.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-body">
                  <span className="mt-0.5 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-good-bg text-[9px] font-bold text-good">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <div className="text-2xs font-bold uppercase tracking-wider text-bad">
              {FLOW_COPY.termsNotCovered}
            </div>
            <ul className="mt-2 flex flex-col gap-2" data-testid="terms-not-covered">
              {terms.notCovered.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-body">
                  <span className="mt-0.5 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-bad-bg text-[9px] font-bold text-bad">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <div className="text-2xs font-bold uppercase tracking-wider text-faint">
              {FLOW_COPY.termsPayment}
            </div>
            <p className="mt-1 text-sm text-body">{terms.payment}</p>
          </div>

          <div
            className="mt-4 rounded-lg border border-accent-line bg-accent-soft px-4 py-3"
            data-testid="terms-limit"
          >
            <div className="text-2xs font-bold uppercase tracking-wider text-accent-ink">
              {FLOW_COPY.termsLimit}
            </div>
            <div className="num mt-0.5 text-lg font-bold text-ink">
              {formatN(usdToN(limitUsd, usdPerN), { maxFractionDigits: 0 })}
            </div>
            <div className="num text-2xs text-ink">
              {formatUsd(limitUsd)} {FLOW_COPY.termsLimitPerAgent}
            </div>
            <p className="mt-2 border-t border-accent-line pt-2 text-2xs text-body">
              {FLOW_COPY.termsDepletion}
            </p>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-3">
            <input
              type="checkbox"
              data-testid="terms-acknowledge"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-[#00c988]"
            />
            <span className="text-sm font-semibold text-ink">{terms.acknowledgment}</span>
          </label>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <button
              type="button"
              data-testid="terms-back"
              onClick={() => (page > 1 ? navigate(`/flow/terms/${page - 1}`) : navigate('/flow/quote'))}
              className="text-sm font-semibold text-muted"
            >
              Back
            </button>
            <button
              type="button"
              data-testid="terms-agree"
              disabled={!acknowledged}
              onClick={agree}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {FLOW_COPY.termsAgree}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
