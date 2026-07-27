/**
 * Connect flow, final step — payment (route /flow/pay), reached after the
 * signature. Two settlement options: pay upfront (settled now in $NEAR) or
 * pay with stake (recommended; rewards fund the premium). Each option runs
 * its own confirmation and settlement demo, then cover activates and the
 * flow lands on the policies dashboard.
 *
 * Stake today records the choice and settles through the same payment port
 * as upfront; the real staking mechanics arrive in a later iteration.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../../components/LatencyTheater';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { FLOW_COPY } from '../../data/copy';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { executePayment, PaymentAbortedError } from '../../lib/payments';
import { useStore } from '../../store';
import {
  getSelectedAgentIds,
  isSigned,
  setPaymentMethod,
  type FlowPaymentMethod,
} from './flowState';

/** Stake sized so a 10% reward rate funds the premium in full. */
const STAKE_REWARD_RATE = 0.1;

export default function FlowPay() {
  const enrollments = useStore((s) => s.enrollments);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'choose' | FlowPaymentMethod>('choose');
  const [processing, setProcessing] = useState(false);
  const selected = getSelectedAgentIds();

  // Payment is reachable only after the signature is recorded.
  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
    else if (!isSigned()) navigate('/flow/sign', { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0 || !isSigned()) return null;

  const totalPremiumUsd = enrollments
    .filter((e) => selected.includes(e.agentId) && e.terminatedAt === undefined)
    .reduce((a, e) => a + e.premiumUsd, 0);
  const premiumN = usdToN(totalPremiumUsd, usdPerN);
  const stakeN = premiumN / STAKE_REWARD_RATE;

  const choose = (method: FlowPaymentMethod) => {
    setPaymentMethod(method);
    setPhase(method);
  };

  const finalize = async () => {
    const gen = useStore.getState().resetGeneration;
    try {
      const receipt = await executePayment(
        'initial',
        totalPremiumUsd,
        { agentIds: [...selected] },
        { stale: () => useStore.getState().resetGeneration !== gen },
      );
      useStore.getState().activateEnrollments(receipt);
      navigate('/policies');
    } catch (err) {
      if (!(err instanceof PaymentAbortedError)) throw err;
    }
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowPay">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">{FLOW_COPY.payTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{FLOW_COPY.paySub}</p>
      </div>

      {phase === 'choose' && (
        <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="text-sm font-semibold text-ink">{FLOW_COPY.payUpfrontTitle}</div>
            <p className="mt-1 flex-1 text-xs text-muted">{FLOW_COPY.payUpfrontBody}</p>
            <button
              type="button"
              data-testid="pay-upfront"
              onClick={() => choose('upfront')}
              className="mt-4 self-start rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
            >
              {FLOW_COPY.payChoose}
            </button>
          </div>
          <div className="relative flex flex-col rounded-card border-2 border-[#0b7a52] bg-panel p-5 shadow-card">
            <span
              data-testid="pay-stake-recommended"
              className="absolute -top-2.5 right-4 rounded-full bg-[#0b7a52] px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white"
            >
              {FLOW_COPY.payRecommended}
            </span>
            <div className="text-sm font-semibold text-ink">{FLOW_COPY.payStakeTitle}</div>
            <p className="mt-1 flex-1 text-xs text-muted">{FLOW_COPY.payStakeBody}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="pay-stake"
                onClick={() => choose('stake')}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
              >
                {FLOW_COPY.payChoose}
              </button>
              <span
                data-testid="pay-stake-credit"
                className="inline-flex rounded border border-good-line bg-good-bg px-2 py-1 text-2xs font-semibold text-good"
              >
                {FLOW_COPY.payStakeCredit}
              </span>
            </div>
          </div>
        </div>
      )}

      {phase !== 'choose' && (
        <div className="max-w-xl rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-md font-semibold text-ink">
              {phase === 'upfront'
                ? FLOW_COPY.payConfirmUpfrontTitle
                : FLOW_COPY.payConfirmStakeTitle}
            </h2>
            <SimulatedBadge />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Cell
              label={FLOW_COPY.payLabels.premium}
              value={formatUsd(totalPremiumUsd)}
            />
            <Cell
              label={FLOW_COPY.payLabels.settlesAs}
              value={formatN(premiumN, { maxFractionDigits: 1 })}
            />
            {phase === 'stake' && (
              <Cell
                label={FLOW_COPY.payLabels.stake}
                value={formatN(stakeN, { maxFractionDigits: 0 })}
              />
            )}
          </div>

          {phase === 'stake' && (
            <p className="mt-3 text-xs text-muted" data-testid="stake-note">
              {FLOW_COPY.payStakeEstimate(formatN(stakeN, { maxFractionDigits: 0 }))}{' '}
              {FLOW_COPY.payStakeNote}
            </p>
          )}

          {processing ? (
            <LatencyTheater
              className="mt-4"
              title={
                phase === 'upfront'
                  ? FLOW_COPY.payUpfrontTheaterTitle
                  : FLOW_COPY.payStakeTheaterTitle
              }
              steps={(phase === 'upfront'
                ? FLOW_COPY.payUpfrontSteps
                : FLOW_COPY.payStakeSteps
              ).map((label) => ({ label }))}
              totalMs={3000}
              onDone={() => {
                void finalize();
              }}
            />
          ) : (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                data-testid="pay-back"
                onClick={() => setPhase('choose')}
                className="text-sm font-semibold text-muted"
              >
                {FLOW_COPY.payBack}
              </button>
              <button
                type="button"
                data-testid="pay-confirm"
                onClick={() => setProcessing(true)}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
              >
                {phase === 'upfront'
                  ? FLOW_COPY.payConfirmUpfront
                  : FLOW_COPY.payConfirmStake}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
