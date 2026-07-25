/**
 * Screen 7.9 — My policies (the dashboard). WP-4.
 *
 * Per-agent rows (name, StatusPill, cap, rate, premium, renewal, 4+7
 * controls-health dot strip, last guardrail verification); side rail
 * (totals, concentration meter, near-miss feed with credit tags — REQ-7.9.3,
 * AC-11); amber strip + "Complete verification" when unverified (REQ-7.2.2).
 * Row actions: Edit mandate (navigates to WP-2's /mandate?edit=:agentId,
 * AC-8 pending label), Adopt a control (pro-rata surcharge refund, both
 * currencies), De-enroll (D7 + $0-if-claim exception, §9b). "Simulate
 * incident" renders only when presenter-armed. Suspension flips the pill
 * with the cause named + "Cure" (REQ-7.9.1, AC-12). Renewal preview per §9c.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { MathValue } from '../components/MathValue';
import { StatusPill } from '../components/StatusPill';
import { isOperatorVerifiedNow } from '../components/UnverifiedBanner';
import { NEAR_MISS_CREDIT_HOVER, SUSPENSION_COPY } from '../data/copy';
import { demoNow } from '../lib/demoClock';
import { formatN, formatUsd, usdToN } from '../lib/money';
import {
  deEnrollRefund,
  proRataRefund,
  renewalPreview,
  TIER2_SURCHARGES,
} from '../lib/pricing';
import { useStore } from '../store';
import type { NearMiss, Tier2Control } from '../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../store/types';
import {
  buildPolicyRows,
  fmtDate,
  fmtDayMonth,
  relTime,
  tier1DotsAt,
  tier2DotsAt,
  type PolicyRow,
} from './portfolio/helpers';

/** Deterministic near-miss templates for the "Report a near-miss" action. */
const NEAR_MISS_TEMPLATES: Array<Pick<NearMiss, 'type' | 'description'>> = [
  { type: 'timelock-hold', description: 'Timelock held a $62,000 transfer; reversed' },
  { type: 'kill-switch', description: 'Kill switch drill passed' },
  { type: 'blocked-injection', description: 'Injection attempt blocked and reported' },
  { type: 'hitl-rejection', description: 'HITL approver rejected an over-threshold transfer' },
];

interface AdoptSheetState {
  agentId: string;
  /** Control being verified (latency theater running). */
  verifying?: Tier2Control;
}

interface DeEnrollNote {
  at: number;
  refundUsd: number;
  zeroReason?: string;
}

const VERIFY_STEPS = [
  { label: 'Confirming registry filing…' },
  { label: 'Matching beneficial owners…' },
  { label: 'Issuing verification attestation…' },
];

const CONTROL_VERIFY_STEPS = (label: string) => [
  { label: `Installing ${label}…` },
  { label: 'Running verification checks…' },
  { label: 'Recording operative interval…' },
];

const TIER2_LABELS: Record<Tier2Control, string> = {
  attestation: 'TEE attestation',
  kyb: 'Company verification (KYB)',
  timelock: 'Timelock on large transfers',
  recovery: 'Recovery mechanism',
  harnessAudit: 'Independent harness audit',
  hitl: 'Human approval above threshold',
  killSwitch: 'Kill switch + anomaly monitoring',
};

export default function Policies() {
  const navigate = useNavigate();
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const mandates = useStore((s) => s.mandates);
  const pendingEdits = useStore((s) => s.pendingEdits);
  const nearMisses = useStore((s) => s.nearMisses);
  const operator = useStore((s) => s.operator);
  const armed = useStore((s) => s.presenter.armed);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  // re-derive interval state when the presenter fast-forwards
  useStore((s) => s.presenter.timeOffsetMs);
  const claims = useStore((s) => s.claims);
  const incidents = useStore((s) => s.incidents);

  const now = demoNow();
  const verified = isOperatorVerifiedNow(operator.verificationHistory);

  const rows = useMemo(
    () => buildPolicyRows(agents, enrollments, mandates, pendingEdits, now),
    [agents, enrollments, mandates, pendingEdits, now],
  );
  const liveRows = rows.filter((r) => r.enrollment.terminatedAt === undefined);

  const totalCapsUsd = liveRows.reduce((a, r) => a + r.capUsd, 0);
  const totalPremiumUsd = liveRows.reduce((a, r) => a + r.enrollment.premiumUsd, 0);

  // -- local UI state ---------------------------------------------------------
  const [verifying, setVerifying] = useState(false);
  const [verifyRefundUsd, setVerifyRefundUsd] = useState<number | undefined>();
  const [adoptSheet, setAdoptSheet] = useState<AdoptSheetState | undefined>();
  const [adoptRefunds, setAdoptRefunds] = useState<
    Record<string, { control: Tier2Control; usd: number }>
  >({});
  const [deEnrollNotes, setDeEnrollNotes] = useState<Record<string, DeEnrollNote>>({});
  const [deEnrollConfirm, setDeEnrollConfirm] = useState<string | undefined>();

  const store = useStore.getState;

  // -- verification nudge (REQ-7.2.2): +0.4% pro-rata refund, future events --
  const completeVerification = () => setVerifying(true);
  const onVerified = () => {
    const at = demoNow();
    store().verifyOperator(at);
    // The +0.4% unverified surcharge refunds pro rata from the verification
    // date across every live enrollment — future events only (T5.3).
    const total = liveRows.reduce(
      (a, r) => a + proRataRefund(0.4, r.capUsd, at, r.enrollment.renewalAt, at).usd,
      0,
    );
    setVerifyRefundUsd(Math.round(total * 100) / 100);
    setVerifying(false);
  };

  // -- suspension cure (REQ-7.9.1, AC-12) -------------------------------------
  // Cause-specific: resolve the UNDERLYING condition for the displayed
  // suspension's reason, then close only that reason's interval. The agent
  // derives Active only when no other open trigger remains.
  const cure = (row: PolicyRow) => {
    const at = demoNow();
    const reason = row.suspension?.reason;
    if (reason === undefined) return;
    if (reason.includes('premium')) {
      // A premium-overdue suspension leaves an unpaid item in paymentHistory;
      // curing must settle it too, or premiumCurrentAt would keep failing any
      // later claim's conditions precedent forever even though the pill shows
      // Active again.
      store().payOverdueInstallments(row.agent.id, at);
    } else if (reason.includes('verification')) {
      // Restoring the operator's verified interval is the underlying fix.
      store().verifyOperator(at);
    } else {
      // Gate-driven lapse (logging, transfer caps, hash…): reopen any tier-1
      // gate whose interval is closed at `at` — interval writes, never
      // boolean overwrites.
      for (const gate of TIER1_GATES) {
        const open = row.agent.gateHistory[gate].some(
          (iv) => iv.from <= at && (iv.to === undefined || at < iv.to),
        );
        if (!open) store().cureGate(row.agent.id, gate, at);
      }
    }
    store().unsuspendAgent(row.agent.id, at, reason);
  };

  // -- adopt a control: interval opens + pro-rata refund (both currencies) ---
  const adoptControl = (row: PolicyRow, control: Tier2Control) => {
    setAdoptSheet({ agentId: row.agent.id, verifying: control });
  };
  const onControlVerified = (row: PolicyRow, control: Tier2Control) => {
    const at = demoNow();
    store().setTier2(row.agent.id, control, true); // opens the interval
    const points = TIER2_SURCHARGES.find((s) => s.control === control)?.tenths ?? 0;
    const refund = proRataRefund(points / 10, row.capUsd, at, row.enrollment.renewalAt, at);
    store().addCredit(row.agent.id, { type: 'adopt-control', at, points: points / 10 });
    setAdoptRefunds((m) => ({ ...m, [row.agent.id]: { control, usd: refund.usd } }));
    setAdoptSheet(undefined);
  };

  // -- de-enroll (D7 + exception, §9b) ----------------------------------------
  const confirmDeEnroll = (row: PolicyRow) => {
    const at = demoNow();
    const refund = deEnrollRefund(row.enrollment, { claims, incidents }, at);
    store().deEnrollAgent(row.agent.id, at);
    setDeEnrollNotes((m) => ({
      ...m,
      [row.agent.id]: {
        at,
        refundUsd: refund.usd,
        zeroReason: 'reason' in refund ? refund.reason : undefined,
      },
    }));
    setDeEnrollConfirm(undefined);
  };

  // -- near-miss reporting (REQ-7.9.3; capped at the four preset events) ------
  const nearMissLimitReached = nearMisses.length >= NEAR_MISS_TEMPLATES.length;
  const reportNearMiss = () => {
    if (nearMissLimitReached) return;
    const template = NEAR_MISS_TEMPLATES[nearMisses.length % NEAR_MISS_TEMPLATES.length];
    const at = demoNow();
    store().addNearMiss({
      id: `near-miss-${nearMisses.length + 1}`,
      type: template.type,
      at,
      creditTag: '+ data credit at renewal',
      creditPoints: 0.01,
      description: template.description,
    });
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Policies">
      {/* -- page head ------------------------------------------------------ */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg">My policies</h1>
          <div className="mt-1 text-sm text-muted">
            {operator.name}{' '}
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-good-line bg-good-bg px-2 py-px text-2xs font-semibold text-good">
                Verified, KYB current
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-warn-line bg-warn-bg px-2 py-px text-2xs font-semibold text-warn">
                Unverified operator (0.4% surcharge on every quote)
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/connect"
            className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink"
          >
            Add agent
          </Link>
          <Link
            to="/claim"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
          >
            File a claim
          </Link>
        </div>
      </div>

      {/* -- amber verification strip (REQ-7.2.2) --------------------------- */}
      {!verified && !verifying && (
        <div
          data-testid="dashboard-verify-strip"
          className="mb-4 flex items-center gap-3 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn"
        >
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-warn-deep text-2xs font-extrabold text-white">
            !
          </span>
          <span>
            <b>Events occurring now cannot be claimed.</b> Complete verification
            to cover future events. Verification is not retroactive.
          </span>
          <button
            data-testid="dashboard-complete-verification"
            onClick={completeVerification}
            className="ml-auto flex-none rounded-lg bg-warn-deep px-3 py-1.5 text-xs font-semibold text-white"
          >
            Complete verification
          </button>
        </div>
      )}
      {verifying && (
        <LatencyTheater
          className="mb-4"
          title="Completing verification"
          steps={VERIFY_STEPS}
          onDone={onVerified}
        />
      )}
      {verifyRefundUsd !== undefined && (
        <div
          data-testid="verification-refund"
          className="mb-4 rounded-card border border-good-line bg-good-bg px-4 py-3 text-sm text-good"
        >
          <b>Verification complete.</b> The 0.4% unverified surcharge is refunded
          pro rata from the verification date:{' '}
          <MathValue
            breakdown={{
              title: 'Pro-rata verification refund',
              inputs: [
                { label: 'Surcharge removed', amount: '+0.4% → 0' },
                { label: 'Live policies', amount: String(liveRows.length) },
              ],
              formula: `Σ 0.4% × cap × remaining/365 = ${formatUsd(verifyRefundUsd)}`,
              clause: 'T5.3',
              resultUsd: verifyRefundUsd,
            }}
          >
            {formatUsd(verifyRefundUsd)} ≈ {formatN(usdToN(verifyRefundUsd, usdPerN), { maxFractionDigits: 1 })}
          </MathValue>
          . Events from this timestamp forward are claimable.
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        {/* -- policy rows -------------------------------------------------- */}
        <div>
          {rows.length === 0 ? (
            <div className="rounded-card border border-line bg-panel p-8 text-center shadow-card">
              <div className="text-md font-semibold text-ink">No policies yet</div>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Connect an agent, set its mandate and controls, and pay in $NEAR.
                It appears here as a live policy.
              </p>
              <Link
                to="/connect"
                className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink"
              >
                Connect an agent
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rows.map((row) => (
                <PolicyRowCard
                  key={row.agent.id}
                  row={row}
                  now={now}
                  nearMissCount={nearMisses.length}
                  armed={armed}
                  adoptSheet={adoptSheet}
                  adoptRefund={adoptRefunds[row.agent.id]}
                  deEnrollNote={deEnrollNotes[row.agent.id]}
                  deEnrollConfirmOpen={deEnrollConfirm === row.agent.id}
                  claimsBlockRefund={
                    incidents.some((i) => i.agentId === row.agent.id)
                  }
                  onEditMandate={() => navigate(`/mandate?edit=${row.agent.id}`)}
                  onCure={() => cure(row)}
                  onAdopt={(c) => adoptControl(row, c)}
                  onControlVerified={(c) => onControlVerified(row, c)}
                  onDeEnrollAsk={() => setDeEnrollConfirm(row.agent.id)}
                  onDeEnrollCancel={() => setDeEnrollConfirm(undefined)}
                  onDeEnrollConfirm={() => confirmDeEnroll(row)}
                  onSimulateIncident={() => store().setPanelOpen(true)}
                  usdPerN={usdPerN}
                />
              ))}
            </div>
          )}

          {/* renewal preview callout (§9c) */}
          <div
            className="mt-3.5 rounded-card border border-line bg-panel px-4 py-3 shadow-card"
            data-testid="renewal-preview-callout"
            title="Renewal rule: clamp(current ladder rate − 0.05% clean-year − 0.01% per reported near-miss, floor 0.45%, movement bounded to ±0.15% when nothing about the setup changed)."
          >
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-white">
                →
              </span>
              Renewal preview
            </div>
            <p className="mt-1 text-xs text-muted">
              A clean year earns a <b className="num text-ink">0.05% credit</b> at
              renewal, with a floor of 0.45%.{' '}
              {nearMisses.length > 0 && (
                <>
                  {nearMisses.length === 1 ? (
                    <>
                      One reported near miss earns a further{' '}
                      <b className="num text-ink">0.01% credit</b>.
                    </>
                  ) : (
                    <>
                      The <b className="num text-ink">{nearMisses.length}</b> reported
                      near misses earn a further{' '}
                      <b className="num text-ink">0.01%</b> each.
                    </>
                  )}{' '}
                </>
              )}
              If nothing in your setup changes, your renewal rate moves by at most{' '}
              <b className="num text-ink">±0.15%</b>.
            </p>
          </div>
        </div>

        {/* -- side rail ---------------------------------------------------- */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-card border border-line bg-panel p-4 shadow-card" data-testid="programme-summary">
            <div className="text-2xs font-bold uppercase tracking-widest text-faint">
              Programme summary
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted">Covered agents</span>
              <b className="num">{liveRows.length}</b>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-muted">Total insured caps</span>
              <b className="num" data-testid="total-caps">{formatUsd(totalCapsUsd)}</b>
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs">
              <span className="text-muted">Total annual premium</span>
              <MathValue
                className="text-md font-semibold"
                breakdown={{
                  title: 'Total annual premium',
                  inputs: liveRows.map((r) => ({
                    label: r.agent.name,
                    amount: formatUsd(r.enrollment.premiumUsd),
                  })),
                  formula: `Σ per-agent premiums = ${formatUsd(totalPremiumUsd)}`,
                  clause: 'REQ-7.7.1',
                  resultUsd: totalPremiumUsd,
                }}
              >
                <span data-testid="total-premium">{formatUsd(totalPremiumUsd)}</span>
              </MathValue>
            </div>
            <div className="num mt-1 text-right font-mono text-2xs text-accent-ink">
              ≈ {formatN(usdToN(totalPremiumUsd, usdPerN), { maxFractionDigits: 1 })} at
              1 $NEAR = ${usdPerN.toFixed(2)}
            </div>
          </div>

          <div className="rounded-card border border-line bg-panel p-4 shadow-card" data-testid="near-miss-feed">
            <div className="flex items-baseline justify-between">
              <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                Near miss feed
              </div>
              {!nearMissLimitReached && (
                <button
                  data-testid="report-near-miss"
                  onClick={reportNearMiss}
                  className="text-2xs font-semibold text-accent-ink"
                >
                  Report a near miss
                </button>
              )}
            </div>
            {nearMisses.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                Nothing reported yet. Each reported near miss earns a renewal
                credit.
              </p>
            ) : (
              <ul>
                {[...nearMisses].reverse().map((nm) => (
                  <li
                    key={nm.id}
                    data-testid="near-miss-item"
                    className="border-b border-line-soft py-2.5 last:border-b-0"
                  >
                    <div className="text-xs font-semibold text-ink">{nm.description}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-2xs text-faint">{relTime(nm.at, now)}</span>
                      <span
                        data-testid="near-miss-credit-tag"
                        title={NEAR_MISS_CREDIT_HOVER}
                        className="cursor-help rounded-md border border-accent-line bg-accent-soft px-1.5 py-px text-2xs font-semibold text-accent-ink"
                      >
                        {nm.creditTag}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 border-t border-line-soft pt-2 text-2xs text-faint">
              Near misses are reportable within 7 days of discovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One policy row
// ---------------------------------------------------------------------------

interface PolicyRowCardProps {
  row: PolicyRow;
  now: number;
  nearMissCount: number;
  armed: boolean;
  adoptSheet?: AdoptSheetState;
  adoptRefund?: { control: Tier2Control; usd: number };
  deEnrollNote?: DeEnrollNote;
  deEnrollConfirmOpen: boolean;
  claimsBlockRefund: boolean;
  usdPerN: number;
  onEditMandate: () => void;
  onCure: () => void;
  onAdopt: (control: Tier2Control) => void;
  onControlVerified: (control: Tier2Control) => void;
  onDeEnrollAsk: () => void;
  onDeEnrollCancel: () => void;
  onDeEnrollConfirm: () => void;
  onSimulateIncident: () => void;
}

function PolicyRowCard({
  row,
  now,
  nearMissCount,
  armed,
  adoptSheet,
  adoptRefund,
  deEnrollNote,
  deEnrollConfirmOpen,
  claimsBlockRefund,
  usdPerN,
  onEditMandate,
  onCure,
  onAdopt,
  onControlVerified,
  onDeEnrollAsk,
  onDeEnrollCancel,
  onDeEnrollConfirm,
  onSimulateIncident,
}: PolicyRowCardProps) {
  const { agent, enrollment, capUsd, status, suspension, pendingEdit } = row;
  const terminated = enrollment.terminatedAt !== undefined;
  const tier1Dots = tier1DotsAt(agent, now);
  const tier2Dots = tier2DotsAt(agent, now);
  const offControls = TIER2_CONTROLS.filter((c, i) => {
    void c;
    return !tier2Dots[i];
  });
  const preview = renewalPreview(row.ladderPct, nearMissCount, true);
  const adoptingHere = adoptSheet?.agentId === agent.id;

  return (
    <div
      data-testid={`policy-row-${agent.id}`}
      className="rounded-card border border-line bg-panel px-4 py-3.5 shadow-card"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[150px_minmax(125px,1fr)_95px_82px_95px_100px_85px] md:items-start">
        <div>
          <div className="text-sm font-semibold text-ink">{agent.name}</div>
          <span className="rounded border border-line bg-canvas px-1.5 font-mono text-2xs text-muted">
            {agent.configHash.slice(0, 6)}…{agent.configHash.slice(-4)}
          </span>
        </div>
        <div>
          <span
            className="inline-flex items-center gap-[3px]"
            data-testid="controls-dots"
            title="Controls health: 4 tier-1 gates + 7 tier-2 controls"
          >
            {tier1Dots.map((on, i) => (
              <i
                key={`t1-${i}`}
                className={`inline-block h-[7px] w-[7px] rounded-full ${on ? 'bg-ink' : 'border-[1.5px] border-warn-deep bg-panel'}`}
              />
            ))}
            <span className="w-1.5" />
            {tier2Dots.map((on, i) => (
              <i
                key={`t2-${i}`}
                className={`inline-block h-[7px] w-[7px] rounded-full ${on ? 'bg-accent' : 'border-[1.5px] border-warn-deep bg-panel'}`}
              />
            ))}
          </span>
          <div className="mt-1 text-2xs text-faint">
            {enrollment.effectiveAt !== 0
              ? `Guardrails verified ${fmtDayMonth(enrollment.effectiveAt)}`
              : 'Guardrails verified at activation'}
            {row.loadingsPct > 0 && (
              <>
                {', '}
                <span className="font-semibold text-warn">
                  +{row.loadingsPct}% loading
                </span>
              </>
            )}
            {agent.controls.tier2.attestation === false && (
              <>
                {', '}
                <span className="font-semibold text-bad">Coverage B excluded</span>
              </>
            )}
          </div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wider text-faint">Cap</div>
          <div className="num mt-0.5 text-xs font-semibold text-ink">
            {formatUsd(capUsd)}
          </div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wider text-faint">Rate</div>
          <div className="num mt-0.5 text-xs font-semibold text-ink" data-testid="row-rate">
            {terminated ? '—' : `${row.totalPct}%`}
          </div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wider text-faint">
            Premium
          </div>
          {terminated ? (
            <div className="num mt-0.5 text-xs font-semibold text-ink">—</div>
          ) : (
            <MathValue
              breakdown={{
                title: 'Annual premium',
                inputs: [
                  { label: 'Total rate', amount: `${row.totalPct}%` },
                  { label: 'Per-agent cap', amount: formatUsd(capUsd) },
                ],
                formula: `${row.totalPct}% × ${formatUsd(capUsd)} = ${formatUsd(enrollment.premiumUsd)}`,
                clause: 'Appendix 3',
                resultUsd: enrollment.premiumUsd,
              }}
            >
              <div className="num mt-0.5 text-xs font-semibold text-ink">
                {formatUsd(enrollment.premiumUsd)}
              </div>
            </MathValue>
          )}
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wider text-faint">
            Renews
          </div>
          <div className="num mt-0.5 whitespace-nowrap text-xs font-semibold text-ink">
            {terminated ? '—' : fmtDate(enrollment.renewalAt)}
          </div>
        </div>
        <div className="text-right md:self-center">
          <StatusPill status={status} reason={suspension?.reason} />
        </div>
      </div>

      {/* pending mandate edit (AC-8 read side) */}
      {pendingEdit && (
        <div
          data-testid="pending-edit-label"
          className="mt-2 rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-2xs font-semibold text-accent-ink"
        >
          Pending mandate change: {formatUsd(pendingEdit.deltaUsd, { signed: true })} (≈{' '}
          {formatN(pendingEdit.deltaN, { maxFractionDigits: 1 })}) due. The change takes
          effect after payment. Until then the current mandate governs cover.
        </div>
      )}

      {/* suspension cause + cure (REQ-7.9.1, AC-12) */}
      {suspension && (
        <div
          data-testid="suspension-strip"
          className="mt-2 flex items-center gap-3 rounded-md border border-warn-line bg-warn-bg px-3 py-2 text-2xs text-warn"
        >
          <span>
            <b data-testid="suspension-cause">Cause: {suspension.reason}.</b>{' '}
            {SUSPENSION_COPY}
          </span>
          <button
            data-testid="cure-button"
            onClick={onCure}
            className="ml-auto flex-none rounded-md bg-warn-deep px-2.5 py-1 text-2xs font-semibold text-white"
          >
            Cure and restore cover
          </button>
        </div>
      )}

      {/* de-enrolled note / renewal preview + actions */}
      {terminated ? (
        <div className="mt-2 text-2xs text-muted" data-testid="de-enroll-note">
          De-enrolled {fmtDate(enrollment.terminatedAt ?? now)}
          {deEnrollNote &&
            (deEnrollNote.zeroReason ? (
              <>
                . Refund <b className="num">$0</b>: {deEnrollNote.zeroReason} (D7
                exception)
              </>
            ) : (
              <>
                . Refunded{' '}
                <b className="num">
                  {formatUsd(deEnrollNote.refundUsd)} ≈{' '}
                  {formatN(usdToN(deEnrollNote.refundUsd, usdPerN), { maxFractionDigits: 1 })}
                </b>
              </>
            ))}
          . Past events remain claimable.
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3 border-t border-line-soft pt-2">
          <span className="num text-2xs text-faint" data-testid="row-renewal-preview" title={preview.breakdown.formula}>
            Renewal preview{' '}
            <b className="text-ink">{preview.renewalRatePct.toFixed(2)}%</b>
            {nearMissCount > 0 && (
              <span className="text-accent-ink"> (includes −0.01% × {nearMissCount} near-miss credit)</span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              data-testid="edit-mandate"
              onClick={onEditMandate}
              className="rounded-md px-2 py-1 text-2xs font-semibold text-accent-ink hover:bg-accent-soft"
            >
              Edit mandate
            </button>
            {offControls.length > 0 && (
              <button
                data-testid="adopt-control"
                onClick={() => onAdopt(offControls[0])}
                className="rounded-md px-2 py-1 text-2xs font-semibold text-accent-ink hover:bg-accent-soft"
              >
                Adopt a control
              </button>
            )}
            <button
              data-testid="de-enroll"
              onClick={onDeEnrollAsk}
              className="rounded-md px-2 py-1 text-2xs font-semibold text-bad hover:bg-bad-bg"
            >
              De-enroll
            </button>
            {armed && (
              <button
                data-testid="simulate-incident"
                onClick={onSimulateIncident}
                className="rounded-md border border-line px-2 py-1 text-2xs font-semibold text-muted"
              >
                Simulate incident
              </button>
            )}
          </span>
        </div>
      )}

      {/* adopt-a-control latency theater + refund */}
      {adoptingHere && adoptSheet?.verifying && (
        <LatencyTheater
          className="mt-2"
          title={`Adopting ${TIER2_LABELS[adoptSheet.verifying]}`}
          steps={CONTROL_VERIFY_STEPS(TIER2_LABELS[adoptSheet.verifying])}
          onDone={() => onControlVerified(adoptSheet.verifying as Tier2Control)}
        />
      )}
      {adoptRefund && (
        <div
          data-testid="adopt-refund"
          className="mt-2 rounded-md border border-good-line bg-good-bg px-3 py-2 text-2xs text-good"
        >
          <b>{TIER2_LABELS[adoptRefund.control]} adopted.</b> The surcharge is
          refunded pro rata from the date verification completes, not from
          installation:{' '}
          <MathValue
            breakdown={
              proRataRefund(
                (TIER2_SURCHARGES.find((s) => s.control === adoptRefund.control)?.tenths ?? 0) / 10,
                capUsd,
                now,
                enrollment.renewalAt,
                now,
              ).breakdown
            }
          >
            <b>
              {formatUsd(adoptRefund.usd)} ≈{' '}
              {formatN(usdToN(adoptRefund.usd, usdPerN), { maxFractionDigits: 1 })}
            </b>
          </MathValue>
        </div>
      )}

      {/* de-enroll confirmation */}
      {deEnrollConfirmOpen && (
        <DeEnrollConfirm
          premiumUsd={enrollment.premiumUsd}
          renewalAt={enrollment.renewalAt}
          now={now}
          usdPerN={usdPerN}
          blocked={claimsBlockRefund}
          onCancel={onDeEnrollCancel}
          onConfirm={onDeEnrollConfirm}
        />
      )}
    </div>
  );
}


function DeEnrollConfirm({
  premiumUsd,
  renewalAt,
  now,
  usdPerN,
  blocked,
  onCancel,
  onConfirm,
}: {
  premiumUsd: number;
  renewalAt: number;
  now: number;
  usdPerN: number;
  blocked: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fraction = Math.max(0, renewalAt - now) / (365 * 24 * 3_600_000);
  const refundUsd = blocked ? 0 : Math.round(premiumUsd * fraction * 100) / 100;
  return (
    <div
      data-testid="de-enroll-confirm"
      className="mt-2 rounded-md border border-bad-line bg-bad-bg px-3 py-2.5 text-2xs text-body"
    >
      <b className="text-bad">De-enroll this agent?</b> Cover for new events ends
      now. Past events remain claimable.{' '}
      {blocked ? (
        <span data-testid="de-enroll-zero-refund">
          Refund: <b className="num">$0</b>. A claim has been paid or noticed on
          this agent.
        </span>
      ) : (
        <span>
          Unused premium is returned pro rata:{' '}
          <b className="num">
            {formatUsd(refundUsd)} ≈{' '}
            {formatN(usdToN(refundUsd, usdPerN), { maxFractionDigits: 1 })}
          </b>{' '}
         .
        </span>
      )}
      <span className="mt-1.5 flex gap-2">
        <button
          data-testid="de-enroll-confirm-button"
          onClick={onConfirm}
          className="rounded-md bg-bad px-2.5 py-1 text-2xs font-semibold text-white"
        >
          De-enroll
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-line px-2.5 py-1 text-2xs font-semibold text-muted"
        >
          Keep the policy
        </button>
      </span>
    </div>
  );
}
