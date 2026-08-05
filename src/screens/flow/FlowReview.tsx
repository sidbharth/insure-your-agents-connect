/**
 * Coverage walkthrough (route /flow/review/:page) — one page per coverage.
 *
 * Each page states what the coverage pays, then shows what we found in the
 * agent's AgentConnect settings account by account, what that earns, and the
 * exact setting that would close any gap. Fixing a gap here updates the
 * setting and the amount on the spot, which is the whole point of the
 * product: cover is an incentive to secure the agent.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FLOW_COPY, FLOW_TERMS, REVIEW_COPY } from '../../data/copy';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { useStore } from '../../store';
import { updateAccount, updateSecurity } from './accounts';
import {
  COVER_LETTERS,
  evaluateCoverage,
  type CheckResult,
  type CoverLetter,
  type FixTarget,
} from './coverage';
import { getAgreedPages, getSelectedAgentIds, markPageAgreed } from './flowState';

const PAGE_COUNT = COVER_LETTERS.length;

/** Apply a fix to the underlying settings. */
function applyFix(agentId: string, fix: FixTarget): void {
  if (fix.kind === 'security') {
    updateSecurity(agentId, { [fix.setting]: true });
    return;
  }
  switch (fix.setting) {
    case 'approval':
      updateAccount(agentId, fix.accountId, { transferApproval: 'review-required' });
      break;
    case 'delay':
      updateAccount(agentId, fix.accountId, { reviewDelayHours: 24 });
      break;
    case 'limit':
      updateAccount(agentId, fix.accountId, { transferLimitNear: 1_000 });
      break;
    case 'whitelist':
      updateAccount(agentId, fix.accountId, { whitelist: true });
      break;
  }
}

function CheckRow({
  check,
  onFix,
}: {
  check: CheckResult;
  onFix?: (fix: FixTarget) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1 text-xs">
      <span
        className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-[9px] font-bold ${
          check.pass ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'
        }`}
      >
        {check.pass ? '✓' : '✕'}
      </span>
      <span className="text-body">{check.label}</span>
      <span className="num font-mono text-2xs text-ink">{check.found}</span>
      {!check.pass && check.fix !== undefined && onFix !== undefined && (
        <button
          type="button"
          data-testid="review-fix"
          onClick={() => onFix(check.fix as FixTarget)}
          className="rounded border border-accent-line bg-accent-soft px-1.5 py-px text-2xs font-semibold text-accent-ink"
        >
          {REVIEW_COPY.fixNow}
        </button>
      )}
    </li>
  );
}

export default function FlowReview() {
  const { page: pageParam } = useParams();
  const agents = useStore((s) => s.agents);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();
  const [acknowledged, setAcknowledged] = useState(false);
  // Bumping this re-reads the settings after a fix.
  const [revision, setRevision] = useState(0);

  const page = Number(pageParam);
  const validPage = Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT;
  const maxAllowed = Math.min(getAgreedPages() + 1, PAGE_COUNT);

  useEffect(() => {
    setAcknowledged(false);
  }, [page]);

  useEffect(() => {
    if (selected.length === 0) {
      navigate('/', { replace: true });
    } else if (!validPage) {
      navigate('/flow/review/1', { replace: true });
    } else if (page > maxAllowed) {
      navigate(`/flow/review/${maxAllowed}`, { replace: true });
    }
  }, [selected.length, validPage, page, maxAllowed, navigate]);
  if (selected.length === 0 || !validPage || page > maxAllowed) return null;

  const letter = COVER_LETTERS[page - 1] as CoverLetter;
  const terms = FLOW_TERMS[page - 1];

  const fix = (agentId: string, target: FixTarget) => {
    applyFix(agentId, target);
    setRevision((r) => r + 1);
  };

  const agree = () => {
    if (!acknowledged) return;
    markPageAgreed(page);
    if (page < PAGE_COUNT) navigate(`/flow/review/${page + 1}`);
    else navigate('/flow/summary');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowReview">
      <div className="mx-auto max-w-[680px]">
        <div className="text-2xs font-bold uppercase tracking-widest text-ink">
          {REVIEW_COPY.progress(page)}
        </div>
        <h1 className="mt-1 text-lg font-bold tracking-tight text-ink">
          Coverage {letter}. {terms.title}
        </h1>
        <p className="mt-1 text-sm text-body">{terms.intro}</p>

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

        <div className="mt-4 flex flex-col gap-3" data-testid={`review-page-${letter}`}>
          {selected.map((agentId) => {
            const agent = agents.find((a) => a.id === agentId);
            if (agent === undefined) return null;
            const evaluation = evaluateCoverage(agentId, letter);
            void revision; // recompute after a fix
            const note =
              evaluation.status === 'full'
                ? REVIEW_COPY.fullNote
                : evaluation.status === 'partial'
                  ? REVIEW_COPY.partialNote(evaluation.qualifyingCount, evaluation.totalCount)
                  : REVIEW_COPY.noneNote;
            return (
              <div
                key={agentId}
                data-testid={`review-agent-${agentId}`}
                className="rounded-card border border-line bg-panel p-5 shadow-card"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="num font-mono text-sm font-semibold text-ink">
                    {agent.name}
                  </span>
                  <span className="text-right">
                    <span
                      className="num block text-sm font-bold text-ink"
                      data-testid={`review-amount-${agentId}`}
                    >
                      {formatN(usdToN(evaluation.coverUsd, usdPerN), { maxFractionDigits: 0 })}
                    </span>
                    <span className="num block text-2xs text-ink">
                      {formatUsd(evaluation.coverUsd)}
                    </span>
                  </span>
                </div>

                <div className="mt-3">
                  <div className="text-2xs font-bold uppercase tracking-wider text-ink">
                    {REVIEW_COPY.yourSetup}
                  </div>
                  {evaluation.agentChecks.length > 0 && (
                    <ul className="mt-1.5">
                      {evaluation.agentChecks.map((check) => (
                        <CheckRow
                          key={check.label}
                          check={check}
                          onFix={(t) => fix(agentId, t)}
                        />
                      ))}
                    </ul>
                  )}
                  {evaluation.accounts.map((row) => (
                    <div key={row.account.id} className="mt-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink">
                          {row.account.name}
                        </span>
                        <span
                          className={`inline-flex rounded border px-1.5 py-px text-2xs font-semibold ${
                            row.qualifies
                              ? 'border-good-line bg-good-bg text-good'
                              : 'border-bad-line bg-bad-bg text-bad'
                          }`}
                        >
                          {row.qualifies
                            ? REVIEW_COPY.accountCovered
                            : REVIEW_COPY.accountNotCovered}
                        </span>
                      </div>
                      {row.checks.length > 0 && (
                        <ul className="mt-0.5">
                          {row.checks.map((check) => (
                            <CheckRow
                              key={check.label}
                              check={check}
                              onFix={(t) => fix(agentId, t)}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-3 border-t border-line-soft pt-2 text-2xs text-body">
                  {note}
                </p>
              </div>
            );
          })}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-3">
          <input
            type="checkbox"
            data-testid="review-acknowledge"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[#00c988]"
          />
          <span className="text-sm font-semibold text-ink">{terms.acknowledgment}</span>
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="review-back"
            onClick={() =>
              page > 1 ? navigate(`/flow/review/${page - 1}`) : navigate('/')
            }
            className="text-sm font-semibold text-body"
          >
            {REVIEW_COPY.back}
          </button>
          <button
            type="button"
            data-testid="review-agree"
            disabled={!acknowledged}
            onClick={agree}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {FLOW_COPY.termsAgree}
          </button>
        </div>
      </div>
    </div>
  );
}
