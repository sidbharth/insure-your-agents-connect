/**
 * Screen 7.8 — Deposit requirement now: pay and activate (WP-3; mockups
 * wizard-pay-summary.html / wizard-pay-activated.html).
 *
 * Framing copy (premium vs treasury vs retention) · order summary per agent
 * · settlement line in N at the live price · annual/quarterly toggle with
 * the >15-days-overdue note · retention preview with the two mandatory
 * worked examples at the displayed price (REQ-7.8.3) · "Demo wallet —
 * Simulated". Button flow per plan §7a: lib/payments.paymentPreflight gates
 * with NAMED blockers (REQ-7.8.1, AC-7) → executePayment('initial', …)
 * (re-fetches the price inside) → latency theater → separate
 * session.activateEnrollments transition → activation ceremony → "View your
 * policy schedule" opens the Enrollment record itself (REQ-7.8.2).
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { MathValue } from '../components/MathValue';
import { PriceChipInline, priceFeedMode } from '../components/helpers';
import { RetentionPreview } from '../components/RetentionPreview';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { StatusPill } from '../components/StatusPill';
import {
  ACTIVATION_CEREMONY_LINE,
  PAY_FRAMING,
  POLICY_SCHEDULE_CAPTION,
  QUARTERLY_NOTE,
} from '../data/copy';
import { demoNowDate } from '../lib/demoClock';
import { shortHash } from '../lib/hash';
import {
  formatClockTime,
  formatN,
  formatPct,
  formatUsd,
  usdToN,
  type MathBreakdown,
} from '../lib/money';
import {
  executePayment,
  PaymentAbortedError,
  paymentPreflight,
  type NamedBlocker,
  type PaymentReceipt,
  type PaymentSessionView,
} from '../lib/payments';
import { useStore } from '../store';
import type { Agent, Enrollment, RootState } from '../store/types';
import { TIER1_GATES } from '../store/types';
import { formatUtcStamp } from './wizard/format';
import { WizardBack, WizardStepper } from './wizard/Stepper';
import {
  activeEnrollments,
  capUsdFor,
  coverageBExcluded,
  enrollmentAgentRows,
  enrollmentRatePct,
  hasConcentrationLoading,
  latestMandate,
} from './purchase/enroll';

type Phase = 'summary' | 'paying';

/** Build the narrow preflight view from live store state (plan §7a). */
export function buildPreflightView(
  state: RootState,
  agentIds: string[],
  paymentMethodSelected: boolean,
): PaymentSessionView {
  return {
    agents: agentIds
      .map((id) => state.agents.find((a) => a.id === id))
      .filter((a): a is Agent => a !== undefined)
      .map((a) => ({
        id: a.id,
        configHash: a.configHash,
        ownershipVerified: a.ownershipVerified,
        tier1AllOn: TIER1_GATES.every((g) => a.controls.tier1[g]),
        mandateCountersigned:
          latestMandate(state, a.id)?.countersigned !== undefined,
      })),
    paymentMethodSelected,
  };
}

/** The Enrollment record — "this record is the policy schedule. No paper." */
function PolicySchedule({
  enrollment,
  agent,
  onClose,
}: {
  enrollment: Enrollment;
  agent: Agent;
  onClose: () => void;
}) {
  const state = useStore();
  const mandate = latestMandate(state, agent.id);
  const rows: [string, React.ReactNode][] = [
    ['Agent', `${agent.name} (${shortHash(agent.configHash)})`],
    ['Mandate version', `v${enrollment.mandateVersion}, countersigned by ${mandate?.countersigned?.by ?? '—'}`],
    [
      'Quote',
      [...enrollment.rateBreakdown, ...enrollment.loadings]
        .map((l) => `${l.label} ${formatPct(l.points, { signed: l.points !== 0.6 })} (${l.clause})`)
        .join(', '),
    ],
    ['Rate', formatPct(enrollmentRatePct(enrollment))],
    [
      'Premium',
      `${formatUsd(enrollment.premiumUsd)} ≈ ${formatN(
        usdToN(enrollment.premiumUsd, enrollment.conversionRateAtPayment || state.priceFeed.usdPerN),
        { maxFractionDigits: 1 },
      )}`,
    ],
    ['Conversion rate at payment', `1 $NEAR = $${(enrollment.conversionRateAtPayment || 0).toFixed(2)}`],
    [
      'Control attestations',
      `Tier-1 gates operative, ${agent.controls.tier2.attestation ? 'TEE attestation live' : 'no attestation (Coverage B excluded)'}`,
    ],
    [
      'Signatures',
      <span key="sig">
        Ownership challenge signed, mandate countersigned{' '}
        {mandate?.countersigned ? formatUtcStamp(mandate.countersigned.at) : ''} <SimulatedBadge />
      </span>,
    ],
    ['Effective at', enrollment.effectiveAt ? formatUtcStamp(enrollment.effectiveAt) : '—'],
    ['Renewal at', formatUtcStamp(enrollment.renewalAt)],
  ];
  return (
    <div
      data-testid="policy-schedule"
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-[620px] overflow-auto rounded-card border border-line bg-panel p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-md">Policy schedule</h2>
          <button className="text-sm text-muted" onClick={onClose} data-testid="close-schedule">
            Close
          </button>
        </div>
        <div className="mt-3 divide-y divide-line-soft text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[190px_1fr] py-2">
              <span className="text-xs text-muted">{k}</span>
              <span className="num text-ink-2">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs italic text-muted" data-testid="schedule-caption">
          {POLICY_SCHEDULE_CAPTION}
        </p>
      </div>
    </div>
  );
}

export default function Pay() {
  const state = useStore();
  const usdPerN = state.priceFeed.usdPerN;
  const feed = state.priceFeed;

  const [plan, setPlan] = useState<'annual' | 'quarterly'>('annual');
  const [methodSelected, setMethodSelected] = useState(true);
  const [phase, setPhase] = useState<Phase>('summary');
  const [blockers, setBlockers] = useState<NamedBlocker[]>([]);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [ceremonyDone, setCeremonyDone] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  // In-flight guard independent of rendering state: a second click can never
  // start a second charge even if the summary re-renders mid-payment.
  const inFlightRef = useRef(false);

  // Only enrollments still awaiting their initial payment belong on Pay —
  // already-Active agents (effectiveAt stamped) must not be chargeable again.
  const enrollments = activeEnrollments(state).filter((e) => e.effectiveAt === 0);
  const rows = enrollmentAgentRows(enrollments, state.agents);

  const totalUsd = enrollments.reduce((sum, e) => sum + e.premiumUsd, 0);
  const totalCaps = enrollments.reduce((sum, e) => sum + capUsdFor(state, e.agentId), 0);
  const dueN = usdToN(totalUsd, usdPerN);
  const agentIds = rows.map((r) => r.agent.id);
  // Quarterly charges one quarter today; the other three become scheduled
  // installments on the enrollment (created at activation).
  const dueTodayUsd = plan === 'quarterly' ? totalUsd / 4 : totalUsd;
  const dueTodayN = plan === 'quarterly' ? dueN / 4 : dueN;

  const dueBreakdown: MathBreakdown = {
    title: 'Due today',
    inputs: [
      { label: 'Total annual premium', amount: formatUsd(totalUsd), clause: 'Appendix 3' },
      ...(plan === 'quarterly'
        ? [{ label: 'Quarterly plan', amount: `first of 4 installments = ${formatUsd(dueTodayUsd)}` }]
        : []),
      {
        label: '$NEAR reference price',
        amount: `1 $NEAR = $${usdPerN.toFixed(2)} (${priceFeedMode(feed)}, ${formatClockTime(feed.fetchedAt)})`,
      },
    ],
    formula: `${formatUsd(dueTodayUsd)} ÷ $${usdPerN.toFixed(2)} = ${formatN(dueTodayN, { maxFractionDigits: 2 })} due today`,
    clause: 'T5.1',
    resultUsd: dueTodayUsd,
    rateUsed: usdPerN,
  };

  const onPay = () => {
    if (inFlightRef.current) return; // one charge per click, ever
    const view = buildPreflightView(useStore.getState(), agentIds, methodSelected);
    const pre = paymentPreflight(view, 'initial-premium');
    if (!pre.ok) {
      setBlockers(pre.blockers);
      return;
    }
    setBlockers([]);
    inFlightRef.current = true;
    setPhase('paying');
    const gen = useStore.getState().resetGeneration;
    // Stamp the chosen plan BEFORE paying so the recorded initial item and
    // the activation transition both see it (quarterly = one quarter now).
    useStore.getState().setPaymentPlan(agentIds, plan);
    // executePayment re-fetches the price INSIDE (REQ-6.2), records the
    // payment, and returns the receipt; activation is the separate
    // session transition below (plan §7a).
    void executePayment(
      'initial',
      dueTodayUsd,
      { agentIds },
      { stale: () => useStore.getState().resetGeneration !== gen },
    )
      .then((r) => {
        useStore.getState().activateEnrollments(r);
        setReceipt(r);
      })
      .catch((err: unknown) => {
        inFlightRef.current = false;
        if (err instanceof PaymentAbortedError) {
          setPhase('summary'); // reset raced the payment — nothing moved
          return;
        }
        throw err;
      });
  };

  // Activated ONLY once BOTH the receipt has landed and the latency ceremony
  // finished — a fast ceremony with a slow receipt must never fall back to a
  // summary with a live Pay button (double-payment risk).
  if (receipt && ceremonyDone) {
    const paidAgentIds = receipt.targets.agentIds ?? [];
    const activatedRows = useStore
      .getState()
      .enrollments.filter((e) => paidAgentIds.includes(e.agentId) && e.terminatedAt === undefined)
      .map((e) => ({
        enrollment: e,
        agent: useStore.getState().agents.find((a) => a.id === e.agentId),
      }))
      .filter((r): r is { enrollment: Enrollment; agent: Agent } => r.agent !== undefined);

    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Pay">
        <div className="rounded-card border border-good-line bg-good-bg p-6 shadow-card" data-testid="activation-ceremony">
          <h1 className="text-lg text-good">Your fleet is covered.</h1>
          <p className="num mt-2 text-sm text-ink-2" data-testid="premium-recorded-line">
            Premium recorded:{' '}
            <b>{formatN(receipt.amountN, { maxFractionDigits: 0 })}</b> (≈{' '}
            {formatUsd(receipt.amountUsd)} at 1 $NEAR = ${receipt.rateUsed.toFixed(2)},{' '}
            {formatClockTime(receipt.paidAt)}) <SimulatedBadge />
          </p>
          <p className="mt-2 max-w-2xl text-sm text-body" data-testid="three-records-line">
            {ACTIVATION_CEREMONY_LINE}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              data-testid="view-policy-schedule"
              className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-ink"
              onClick={() => setScheduleFor(paidAgentIds[0])}
            >
              View your policy schedule
            </button>
            <Link
              to="/policies"
              className="rounded-md border border-line bg-panel px-4 py-2 text-xs font-semibold text-ink-2"
            >
              Go to My Policies
            </Link>
          </div>
          <p className="mt-2 text-2xs italic text-muted">{POLICY_SCHEDULE_CAPTION}</p>
        </div>

        {/* ceremony: each card flips Active with its effective timestamp */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="activation-cards">
          {activatedRows.map(({ agent, enrollment }) => (
            <div
              key={agent.id}
              data-testid={`activated-card-${agent.id}`}
              className="rounded-card border border-line bg-panel p-3.5 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm text-ink">{agent.name}</b>
                <StatusPill status={agent.status} />
              </div>
              <div className="num mt-1 font-mono text-2xs text-muted">
                {shortHash(agent.configHash)}
              </div>
              <div className="num mt-1.5 text-2xs text-muted" data-testid="effective-line">
                effective {formatUtcStamp(enrollment.effectiveAt)}
              </div>
              <button
                className="mt-2 text-2xs font-semibold text-accent-ink"
                onClick={() => setScheduleFor(agent.id)}
                data-testid={`schedule-link-${agent.id}`}
              >
                Policy schedule
              </button>
            </div>
          ))}
        </div>

        {scheduleFor &&
          (() => {
            const e = useStore
              .getState()
              .enrollments.find((en) => en.agentId === scheduleFor && en.terminatedAt === undefined);
            const a = useStore.getState().agents.find((ag) => ag.id === scheduleFor);
            return e && a ? (
              <PolicySchedule enrollment={e} agent={a} onClose={() => setScheduleFor(null)} />
            ) : null;
          })()}
      </div>
    );
  }

  if (phase === 'paying') {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Pay">
        <h1 className="text-lg">Processing payment</h1>
        <LatencyTheater
          className="mt-4 max-w-md"
          title="Paying in $NEAR"
          steps={[
            { label: 'Re-fetching the reference price…' },
            { label: 'Recording premium at today\u2019s reference rate…' },
            { label: 'Binding enrollment…' },
          ]}
          onDone={() => setCeremonyDone(true)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Pay">
      <WizardStepper current="pay" className="mb-3" />
      <WizardBack
        to="/fleet"
        note="Going back keeps your order. Nothing is charged until you pay."
        className="mb-5"
      />
      <div className="mb-5">
        <h1 className="text-lg">
          Pay and activate
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted" data-testid="pay-framing">
          {PAY_FRAMING}
        </p>
      </div>

      {/* -------------------------------------------------- order summary */}
      <section className="rounded-card border border-line bg-panel shadow-card" data-testid="pay-order-summary">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-6 py-3.5">
          <h2 className="text-md">Order summary</h2>
          <span className="num text-xs text-muted">
            {rows.length} agent{rows.length === 1 ? '' : 's'}, total insured caps{' '}
            {formatUsd(totalCaps)}
          </span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left text-2xs font-bold uppercase tracking-wider text-muted">
              <th className="px-6 py-2">Agent</th>
              <th className="px-2 py-2">Hash</th>
              <th className="px-2 py-2">Cap</th>
              <th className="px-2 py-2">Controls</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-right">Premium</th>
              <th className="px-6 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, enrollment }) => (
              <tr key={agent.id} className="border-b border-line-soft last:border-b-0" data-testid={`pay-row-${agent.id}`}>
                <td className="px-6 py-2 font-semibold text-ink">{agent.name}</td>
                <td className="num px-2 py-2 font-mono text-xs text-muted">
                  {shortHash(agent.configHash)}
                </td>
                <td className="num px-2 py-2">{formatUsd(capUsdFor(state, agent.id))}</td>
                <td className="px-2 py-2 text-xs text-muted">
                  {hasConcentrationLoading(enrollment) ? (
                    <>
                      all controls{' '}
                      <span className="ml-1 inline-flex rounded border border-accent-line bg-accent-soft px-1.5 py-px text-2xs font-semibold text-accent-ink">
                        +0.1% concentration
                      </span>
                    </>
                  ) : coverageBExcluded(enrollment) ? (
                    <>
                      no attestation{' '}
                      <span className="ml-1 inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                        Coverage B excluded
                      </span>
                    </>
                  ) : (
                    'all controls'
                  )}
                </td>
                <td className="num px-2 py-2 text-right font-semibold">
                  {formatPct(enrollmentRatePct(enrollment))}
                </td>
                <td className="num px-2 py-2 text-right">{formatUsd(enrollment.premiumUsd)}</td>
                <td className="px-6 py-2 text-right text-2xs font-semibold text-accent-ink">
                  Ready to bind
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="flex items-baseline justify-between border-t border-line px-6 py-3">
          <span className="text-sm font-semibold text-ink">Total annual premium</span>
          <span className="num text-md font-bold text-ink" data-testid="pay-total">
            {formatUsd(totalUsd)}{' '}
            <span className="text-sm font-semibold text-muted">
              ≈ {formatN(dueN, { maxFractionDigits: 0 })}
            </span>
          </span>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {/* settlement line at the live price */}
          <div className="rounded-card border border-line bg-panel p-5 shadow-card" data-testid="settlement-line">
            <div className="text-2xs font-bold uppercase tracking-widest text-faint">Due today</div>
            <div className="num mt-1 text-xl font-bold text-ink">
              <MathValue breakdown={dueBreakdown}>
                {formatN(dueTodayN, { maxFractionDigits: 0 })}{' '}
                <span className="text-md font-semibold text-muted">
                  (≈ {formatUsd(dueTodayUsd)} at <PriceChipInline />)
                  {plan === 'quarterly' && ' (first of 4 installments)'}
                </span>
              </MathValue>
            </div>
            <p className="mt-1.5 text-2xs text-muted">
              The price is re-fetched immediately before payment; you pay at that
              moment's reference rate.
            </p>

            {/* annual / quarterly toggle */}
            <div className="mt-4 flex gap-2" data-testid="plan-toggle">
              <button
                data-testid="plan-annual"
                aria-pressed={plan === 'annual'}
                className={`rounded-md border px-3.5 py-2 text-xs font-semibold ${
                  plan === 'annual'
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-panel text-ink-2'
                }`}
                onClick={() => setPlan('annual')}
              >
                Annual
              </button>
              <button
                data-testid="plan-quarterly"
                aria-pressed={plan === 'quarterly'}
                className={`num rounded-md border px-3.5 py-2 text-xs font-semibold ${
                  plan === 'quarterly'
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-panel text-ink-2'
                }`}
                onClick={() => setPlan('quarterly')}
              >
                Quarterly (4 × {formatN(dueN / 4, { maxFractionDigits: 2 })})
              </button>
            </div>
            <div className="mt-1.5 text-2xs text-muted" data-testid="overdue-note">
              {QUARTERLY_NOTE}
            </div>
          </div>

          {/* payment method */}
          <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card" data-testid="payment-method">
            <div className="text-2xs font-bold uppercase tracking-widest text-faint">
              Payment method
            </div>
            <label className="mt-2 flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                data-testid="method-checkbox"
                checked={methodSelected}
                onChange={(e) => setMethodSelected(e.target.checked)}
              />
              <b>Operator wallet</b>
              <span className="num text-xs text-muted">
                near-foundation.near (balance {formatN(state.operator.walletBalance, { maxFractionDigits: 0 })})
              </span>
              <SimulatedBadge />
            </label>
          </div>

          {/* named blockers (REQ-7.8.1, AC-7) */}
          {blockers.length > 0 && (
            <div
              className="mt-4 rounded-card border border-bad-line bg-bad-bg p-4 shadow-card"
              data-testid="pay-blockers"
            >
              <div className="text-sm font-semibold text-bad">
                Activation blocked. Resolve the following:
              </div>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-bad">
                {blockers.map((b) => (
                  <li key={b.key} data-testid={`blocker-${b.key}`}>
                    {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            data-testid="pay-button"
            disabled={rows.length === 0}
            className="mt-4 w-full rounded-md bg-accent px-5 py-3 text-md font-semibold text-ink disabled:bg-[#c7d0db]"
            onClick={onPay}
          >
            Pay in $NEAR and activate
          </button>
          <p className="mt-1.5 text-center text-2xs text-muted">
            Cover attaches when payment is recorded, completing the three
            required records. Current time:{' '}
            {formatClockTime(demoNowDate().getTime())}.
          </p>
        </div>

        {/* retention preview — the two mandatory worked examples (REQ-7.8.3) */}
        <RetentionPreview />
      </div>
    </div>
  );
}
