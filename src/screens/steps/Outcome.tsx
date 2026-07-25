/**
 * Claim step 5 — Outcome (screen 7.11, mockups
 * postpurchase-claim-outcome-payout.html / -denial.html; REQ-7.11.4).
 *
 * Covered: the full pipeline arithmetic (quantum → limit → coinsurance →
 * retention → payout) in $ and N at the day-of-payment rate — settlement is
 * paid through `executePayment('claim-settlement')` so the refetch-first rule
 * holds; S-18 renders the recovery waterfall (insurer repaid first).
 *
 * Denials are first-class end screens, never errors: S-24 model-conduct as a
 * letter with the Coverage-B counterfactual (AC-10); condition-precedent
 * denials carry the forward-looking "Complete verification" action (AC-13).
 */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceFeedMode } from '../../components/helpers';
import { MathValue } from '../../components/MathValue';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import {
  APPEAL_COPY,
  DENIAL_CONDITION_PRECEDENT,
  DENIAL_MODEL_CONDUCT,
} from '../../data/copy';
import { buildAdjudicationInput, SCENARIOS } from '../../data/incidents';
import { adjudicate, recoveryWaterfall } from '../../lib/claims';
import { formatClockTime, formatN, formatUsd } from '../../lib/money';
import { executePayment, PaymentAbortedError } from '../../lib/payments';
import { demoNow } from '../../lib/demoClock';
import { useStore } from '../../store';
import type { AdjudicationResult, Claim, Incident } from '../../store/types';
import { claimRef, fmtUtcDateLong } from './shared';

export interface OutcomeProps {
  claim: Claim;
  incident: Incident;
  onBack: () => void;
}

export default function Outcome({ claim, incident, onBack }: OutcomeProps) {
  const agents = useStore((s) => s.agents);
  const mandates = useStore((s) => s.mandates);
  const enrollments = useStore((s) => s.enrollments);
  const operator = useStore((s) => s.operator);
  const priceFeed = useStore((s) => s.priceFeed);
  const feedMode = priceFeedMode(priceFeed);
  const setClockState = useStore((s) => s.setClockState);
  const setAdjudication = useStore((s) => s.setAdjudication);
  const updateClaim = useStore((s) => s.updateClaim);
  const [paying, setPaying] = useState(false);

  const paid = claim.clockState.anchors.paidAt !== undefined;

  // Unpaid claims always recompute from the incident's own parameters and the
  // interval histories at event time (REQ-7.11.3, AC-9/AC-13). PAID claims
  // render the adjudication persisted at payment time — the settled math is
  // immutable, so later price-feed refreshes never change what a paid claim
  // displays.
  const liveResult: AdjudicationResult = useMemo(
    () =>
      adjudicate(
        buildAdjudicationInput(
          { agents, mandates, enrollments, operator },
          incident,
          priceFeed.usdPerN,
        ),
      ),
    [agents, mandates, enrollments, operator, incident, priceFeed.usdPerN],
  );
  const result: AdjudicationResult =
    paid && claim.adjudication !== undefined ? claim.adjudication : liveResult;

  const determinedAt = claim.clockState.anchors.determinedAt ?? demoNow();

  const acceptPayment = async () => {
    if (result.math === undefined || paid || paying) return;
    setPaying(true);
    const gen = useStore.getState().resetGeneration;
    try {
      // Refetch-first day-of-payment conversion; credits the demo wallet.
      // The dollar amount is a FUNCTION of the post-refetch rate: retention is
      // max(500 N × rate, 2% × loss), so the payout itself is rate-dependent
      // and must be re-adjudicated at the rate actually used for transfer.
      let settled: AdjudicationResult = result;
      const receipt = await executePayment(
        'claim-settlement',
        (rateUsed) => {
          const s = useStore.getState();
          settled = adjudicate(
            buildAdjudicationInput(
              {
                agents: s.agents,
                mandates: s.mandates,
                enrollments: s.enrollments,
                operator: s.operator,
              },
              incident,
              rateUsed,
            ),
          );
          return settled.math?.payoutUsd ?? 0;
        },
        { claimId: claim.id },
        { stale: () => useStore.getState().resetGeneration !== gen },
      );
      // Persist the payment-time adjudication so the paid claim renders this
      // exact math forever, regardless of later feed movement.
      setAdjudication(claim.id, settled);
      const anchors = { ...claim.clockState.anchors, paidAt: receipt.paidAt };
      setClockState(claim.id, { ...claim.clockState, anchors, phase: 'Paid' });
      const scripted = SCENARIOS[incident.scenarioId].scriptedRecoveryUsd;
      if (scripted !== undefined && settled.math !== undefined) {
        const retained = settled.math.coinsuranceUsd + settled.math.retentionUsd;
        updateClaim(claim.id, {
          recovery: {
            amountUsd: scripted,
            waterfall: recoveryWaterfall(scripted, settled.math.payoutUsd, retained),
          },
        });
      }
    } catch (err) {
      if (err instanceof PaymentAbortedError) return; // reset raced the payment
      throw err;
    } finally {
      setPaying(false);
    }
  };

  if (!result.eligibility.covered) {
    const conditionDenial = !result.conditionsPrecedent.pass;
    return (
      <DenialLetter
        claim={claim}
        incident={incident}
        result={result}
        conditionDenial={conditionDenial}
        determinedAt={determinedAt}
        onBack={onBack}
      />
    );
  }

  const math = result.math;
  if (math === undefined) return null;
  const scripted = SCENARIOS[incident.scenarioId].scriptedRecoveryUsd;
  const retainedUsd = math.coinsuranceUsd + math.retentionUsd;
  const waterfall =
    claim.recovery?.waterfall ??
    (scripted !== undefined
      ? recoveryWaterfall(scripted, math.payoutUsd, retainedUsd)
      : undefined);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]" data-testid="claim-step-outcome">
      <div className="rounded-card border border-line bg-panel shadow-card">
        <div className="flex items-center gap-3 rounded-t-card border-b border-good-line bg-good-bg px-5 py-4">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-good text-xs font-bold text-white">
            ✓
          </span>
          <h2 className="text-md font-bold text-good" data-testid="outcome-verdict">
            Covered: payment approved
          </h2>
          <span className="ml-auto">
            <SimulatedBadge />
          </span>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted">
              {incident.scenarioId === 'S-17'
                ? 'Investigation and response costs (Coverage F)'
                : incident.scenarioId === 'S-03'
                  ? 'Covered quantum: the excess over the mandate cap (Coverage D)'
                  : 'Loss: net assets out'}
            </span>
            <span className="num font-mono font-semibold text-ink" data-testid="outcome-loss">
              {formatUsd(math.coveredQuantumUsd, { maxFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted">− Coinsurance (skipped tier-2 controls)</span>
            <span className="num font-mono font-semibold text-ink" data-testid="outcome-coinsurance">
              − {formatUsd(math.coinsuranceUsd, { maxFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted">
              − Retention (after coinsurance)
              {math.retentionWaived && (
                <span className="ml-2 rounded-md border border-good-line bg-good-bg px-1.5 py-0.5 text-2xs font-semibold text-good">
                  waived
                  {incident.scenarioId === 'S-03'
                    ? ': the guardrail passed its latest scheduled verification'
                    : ': near-miss, no net asset loss'}
                </span>
              )}
            </span>
            <span className="num font-mono font-semibold text-ink" data-testid="outcome-retention">
              − {formatUsd(math.retentionUsd, { maxFractionDigits: 2 })}
            </span>
          </div>

          <div className="border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-bold text-ink">Payout</span>
              <MathValue breakdown={math.breakdown} className="text-right">
                <span className="num text-xl font-bold text-ink" data-testid="outcome-payout">
                  {formatUsd(math.payoutUsd, { maxFractionDigits: 2 })}
                </span>
              </MathValue>
            </div>
            <div className="num mt-1 text-right font-mono text-xs text-accent-ink" data-testid="outcome-payout-n">
              ≈ {formatN(math.payoutN, { maxFractionDigits: 0 })} at the day-of-payment
              rate of 1 $NEAR = ${math.rateUsed.toFixed(2)} (
              {feedMode === 'stale' ? 'last known' : feedMode},{' '}
              {formatClockTime(priceFeed.fetchedAt)})
            </div>
          </div>

        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {waterfall !== undefined && (
          <div className="rounded-card border border-line bg-panel p-4 shadow-card" data-testid="recovery-waterfall">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-ink">Recovery waterfall</h3>
              <span className="num font-mono text-xs font-semibold text-accent-ink">
                {formatUsd(waterfall.recoveredUsd)} recovered by tracing
              </span>
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              <li className="flex items-center justify-between rounded-lg border border-line bg-[#fafbfa] px-3 py-2">
                <span>
                  <b>1. Insurer</b>{' '}
                  <span className="text-muted">
                    until its {formatUsd(math.payoutUsd)} is restored
                  </span>
                </span>
                <span className="num font-mono font-semibold text-good">
                  {formatUsd(waterfall.toInsurerUsd)}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-line bg-[#fafbfa] px-3 py-2">
                <span>
                  <b>2. You</b>{' '}
                  <span className="text-muted">
                    retained {formatUsd(retainedUsd)} (coinsurance + retention)
                  </span>
                </span>
                <span className="num font-mono text-muted">
                  {waterfall.toInsuredRetainedUsd > 0
                    ? formatUsd(waterfall.toInsuredRetainedUsd)
                    : 'next in line'}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-line bg-[#fafbfa] px-3 py-2">
                <span>
                  <b>3. Loss beyond the limits</b>
                </span>
                <span className="num font-mono text-muted">
                  {waterfall.toUninsuredUsd > 0 ? formatUsd(waterfall.toUninsuredUsd) : '—'}
                </span>
              </li>
            </ul>
          </div>
        )}

        {paid ? (
          <div
            data-testid="payment-accepted"
            className="rounded-lg border border-good-line bg-good-bg px-3 py-2.5 text-center text-sm font-semibold text-good"
          >
            ✓ Payment accepted. {formatN(math.payoutN, { maxFractionDigits: 0 })} credited
            to your wallet.
          </div>
        ) : (
          <button
            type="button"
            data-testid="accept-payment"
            disabled={paying}
            onClick={() => void acceptPayment()}
            className="rounded-lg bg-ink px-3.5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {paying
              ? 'Fetching the day-of-payment rate…'
              : `Accept payment of ${formatN(math.payoutN, { maxFractionDigits: 0 })}`}
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
        >
          Back to clocks
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Denial letters (REQ-7.11.4 — polished end screens, never errors)
// ---------------------------------------------------------------------------

interface DenialProps {
  claim: Claim;
  incident: Incident;
  result: AdjudicationResult;
  /** true = condition-precedent denial; false = model-conduct (S-24) etc. */
  conditionDenial: boolean;
  determinedAt: number;
  onBack: () => void;
}

function DenialLetter({ claim, incident, result, conditionDenial, determinedAt, onBack }: DenialProps) {
  const operatorName = useStore((s) => s.operator.name);
  const agent = useStore((s) => s.agents.find((a) => a.id === incident.agentId));
  const notifiedAt = claim.clockState.anchors.notifiedAt;

  const modelConduct = incident.scenarioId === 'S-24' && !conditionDenial;
  const bExcluded = !conditionDenial && !modelConduct; // S-09 without attestation
  const verdictLabel = conditionDenial
    ? 'Not payable: condition precedent'
    : modelConduct
      ? 'Not covered: model conduct'
      : 'Not covered: Coverage B excluded';


  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]" data-testid="claim-step-outcome">
      <div
        className="rounded-card border border-line bg-panel shadow-card"
        data-testid="denial-letter"
        style={{ padding: '34px 40px' }}
      >
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-extrabold text-white">
              AC
            </span>
            <span className="text-sm font-bold text-ink">AgentConnect Insurance</span>
          </div>
          <div className="text-right text-2xs text-faint">
            <div>Claim {claimRef(claim.id)}, Policy P-2026-0147</div>
            <div>Determination date: {fmtUtcDateLong(determinedAt)}</div>
          </div>
        </div>

        <div className="mt-5 space-y-4 text-sm leading-relaxed text-body">
          <p>Dear {operatorName},</p>
          {conditionDenial ? (
            <>
              <p>
                We have completed our review of the loss of{' '}
                <b className="num">{formatUsd(incident.lossGrossUsd)}</b>
                {notifiedAt !== undefined && <> notified on {fmtUtcDateLong(notifiedAt)}</>},
                involving {agent?.name ?? incident.agentId}. Your notification was timely
                and your evidence package complete. Thank you.
              </p>
              <p>
                <b className="text-ink">
                  Our determination is that this claim is not payable.
                </b>{' '}
                A condition precedent to cover failed as of the event time:{' '}
                <b>{result.conditionsPrecedent.failedCondition}</b>.{' '}
                {DENIAL_CONDITION_PRECEDENT.body}
              </p>
              <div
                data-testid="condition-forward-action"
                className="rounded-lg border border-[#b2f0d6] bg-[#e4fbf1] px-4 py-3 text-xs text-[#0b7a52]"
              >
                <Link
                  to="/verify"
                  data-testid="complete-verification-action"
                  className="inline-block rounded-lg bg-[#0b7a52] px-3 py-1.5 font-semibold text-white"
                >
                  {DENIAL_CONDITION_PRECEDENT.forwardAction}
                </Link>
              </div>
            </>
          ) : modelConduct ? (
            <>
              <p>
                We have completed our review of the loss of{' '}
                <b className="num">{formatUsd(incident.lossGrossUsd)}</b>
                {notifiedAt !== undefined && <> notified on {fmtUtcDateLong(notifiedAt)}</>},
                in which {agent?.name ?? incident.agentId} paid an invoice for goods that
                were never ordered and do not exist. We reviewed your full evidence
                package, including the attested input and output records for the session
                in question. Your notification was timely, your containment was exemplary,
                and your records were complete. Thank you.
              </p>
              <p>
                <b className="text-ink">Our determination is that this loss is not covered.</b>{' '}
                {DENIAL_MODEL_CONDUCT.body}
              </p>
              <div
                data-component-id="coverage-b-counterfactual"
                data-testid="coverage-b-counterfactual"
                className="rounded-lg border border-[#b2f0d6] bg-[#e4fbf1] px-4 py-3 text-xs text-[#0b7a52]"
              >
                {DENIAL_MODEL_CONDUCT.counterfactual}
              </div>
              <p>
                This determination does not affect your policy&rsquo;s standing, your
                renewal terms, or any other agent in your fleet. Because your reporting and
                containment were within every clock, this event has been recorded to your
                file as fully compliant conduct.
              </p>
            </>
          ) : (
            <>
              <p>
                We have completed our review of the loss of{' '}
                <b className="num">{formatUsd(incident.lossGrossUsd)}</b>
                {notifiedAt !== undefined && <> notified on {fmtUtcDateLong(notifiedAt)}</>},
                involving {agent?.name ?? incident.agentId}.
              </p>
              <p>
                <b className="text-ink">Our determination is that this loss is not covered.</b>{' '}
                The claimed manipulation is {result.eligibility.reason} (clause{' '}
                {result.eligibility.clause}). Without attested input/output records,
                &ldquo;we believe it was tricked&rdquo; cannot be distinguished from the
                excluded case of the model simply being wrong.
              </p>
              <div className="rounded-lg border border-[#b2f0d6] bg-[#e4fbf1] px-4 py-3 text-xs text-[#0b7a52]">
                Enabling TEE attestation restores Coverage B for future events.
              </div>
            </>
          )}
          <p>
            Respectfully,
            <br />
            <b className="text-ink">Claims Committee, AgentConnect Insurance</b>
          </p>
          <p className="border-t border-line pt-3 text-2xs text-faint">
            You may request a fast-track review of this determination within 30
            days. <SimulatedBadge />
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-line bg-panel p-4 shadow-card" data-testid="determination-summary">
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-faint">
            Determination summary
          </h3>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Verdict</dt>
              <dd>
                <span className="rounded-md border border-bad-line bg-bad-bg px-2 py-0.5 font-semibold text-bad" data-testid="outcome-verdict">
                  {verdictLabel}
                </span>
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted">Loss claimed</dt>
              <dd className="num font-mono">{formatUsd(incident.lossGrossUsd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Amount payable</dt>
              <dd className="num font-mono font-semibold">$0 (0 $NEAR)</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Evidence package</dt>
              <dd className="num font-mono">
                {claim.evidence.filter((e) => e.status === 'auto' || e.status === 'uploaded').length}{' '}
                of {claim.evidence.filter((e) => e.status !== 'notApplicable').length} (complete)
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Clocks</dt>
              <dd>all met</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink"
        >
          Request fast-track review
        </button>
        <AppealPanel />
        {bExcluded && (
          <p className="text-2xs text-faint">
            {verdictLabel}: {result.eligibility.reason}
          </p>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
        >
          Back to clocks
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appeal (simulated submission; screen-local by design — the frozen Claim
// shape has no field for appeals, same precedent as the imaging confirm)
// ---------------------------------------------------------------------------

function AppealPanel() {
  const [mode, setMode] = useState<'idle' | 'form' | 'submitted'>('idle');
  const [grounds, setGrounds] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  if (mode === 'idle') {
    return (
      <button
        type="button"
        data-testid="appeal-claim"
        onClick={() => setMode('form')}
        className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink"
      >
        {APPEAL_COPY.action}
      </button>
    );
  }

  if (mode === 'submitted') {
    return (
      <div
        data-testid="appeal-submitted"
        className="rounded-card border border-good-line bg-good-bg px-4 py-3.5"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-good">
          ✓ {APPEAL_COPY.submittedTitle} <SimulatedBadge />
        </div>
        <p className="mt-1 text-xs text-muted">{APPEAL_COPY.submittedBody}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="appeal-form"
      className="rounded-card border border-line bg-panel p-4 shadow-card"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{APPEAL_COPY.formTitle}</h3>
        <SimulatedBadge />
      </div>
      <p className="mt-1 text-xs text-muted">{APPEAL_COPY.formBody}</p>
      <label className="mt-3 block text-2xs font-bold uppercase tracking-wider text-faint">
        {APPEAL_COPY.groundsLabel}
        <textarea
          data-testid="appeal-grounds"
          value={grounds}
          onChange={(e) => setGrounds(e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-normal normal-case tracking-normal text-body outline-none focus:border-accent"
        />
      </label>
      <div className="mt-2.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          data-testid="appeal-file-input"
          className="hidden"
          onChange={(e) => {
            const names = Array.from(e.target.files ?? []).map((f) => f.name);
            if (names.length > 0) setAttachments((prev) => [...prev, ...names]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          data-testid="appeal-attach"
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-ink-2 shadow-card"
        >
          {APPEAL_COPY.attach}
        </button>
        {attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="appeal-attachments">
            {attachments.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded border border-line bg-canvas px-2 py-0.5 text-2xs font-semibold text-muted"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-faint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-line-soft pt-3">
        <button
          type="button"
          data-testid="appeal-cancel"
          onClick={() => setMode('idle')}
          className="text-xs font-semibold text-muted"
        >
          {APPEAL_COPY.cancel}
        </button>
        <button
          type="button"
          data-testid="appeal-submit"
          disabled={grounds.trim().length === 0}
          onClick={() => setMode('submitted')}
          className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-ink disabled:opacity-40"
        >
          {APPEAL_COPY.submit}
        </button>
      </div>
    </div>
  );
}
