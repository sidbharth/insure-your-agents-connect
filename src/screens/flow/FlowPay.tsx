/**
 * Connect flow, final step — payment (route /flow/pay), reached after the
 * signature. One option: pay the yearly price upfront in $NEAR at the live
 * rate. Paying earns NEAR AI credits at 25% of the spend, shown both on the
 * option card and computed for the actual payment on the confirmation.
 * Confirming settles through the payment port, activates cover, and lands
 * on the cover dashboard.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../../components/LatencyTheater';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { FLOW_COPY } from '../../data/copy';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { executePayment, PaymentAbortedError } from '../../lib/payments';
import { useStore } from '../../store';
import { agentPriceUsd } from './coverage';
import { getSelectedAgentIds, isSigned, setPaymentMethod } from './flowState';

/** NEAR AI credits earned per dollar of cover spend. */
const CREDIT_RATE = 0.25;

export default function FlowPay() {
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const selected = getSelectedAgentIds();

  // Payment is reachable only after the signature is recorded.
  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
    else if (!isSigned()) navigate('/flow/sign', { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0 || !isSigned()) return null;

  const totalPremiumUsd = selected.reduce(
    (a, id) => a + agentPriceUsd(id).priceUsd,
    0,
  );
  const premiumN = usdToN(totalPremiumUsd, usdPerN);
  const creditUsd = totalPremiumUsd * CREDIT_RATE;

  const choose = () => {
    setPaymentMethod('upfront');
    setConfirming(true);
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
        <p className="mt-1 max-w-2xl text-sm text-body">{FLOW_COPY.paySub}</p>
      </div>

      {!confirming ? (
        <div className="relative max-w-xl rounded-card border-2 border-[#0b7a52] bg-panel p-5 shadow-card">
          <span
            data-testid="pay-credit-tag"
            className="absolute -top-2.5 right-4 rounded-full bg-[#0b7a52] px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white"
          >
            {FLOW_COPY.payCreditTag}
          </span>
          <div className="text-sm font-semibold text-ink">{FLOW_COPY.payUpfrontTitle}</div>
          <p className="mt-1 text-xs text-body">{FLOW_COPY.payUpfrontBody}</p>
          <p className="mt-2 text-xs text-body" data-testid="pay-credit-body">
            {FLOW_COPY.payCreditBody}
          </p>
          <button
            type="button"
            data-testid="pay-upfront"
            onClick={choose}
            className="mt-4 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
          >
            {FLOW_COPY.payChoose}
          </button>
        </div>
      ) : (
        <div className="max-w-xl rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-md font-semibold text-ink">
              {FLOW_COPY.payConfirmUpfrontTitle}
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
            <Cell
              label={FLOW_COPY.payLabels.credits}
              value={formatUsd(creditUsd)}
            />
          </div>

          <p className="mt-3 text-xs text-body" data-testid="pay-credit-earn">
            {FLOW_COPY.payCreditEarn(formatUsd(creditUsd))}
          </p>

          {processing ? (
            <LatencyTheater
              className="mt-4"
              title={FLOW_COPY.payUpfrontTheaterTitle}
              steps={FLOW_COPY.payUpfrontSteps.map((label) => ({ label }))}
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
                onClick={() => setConfirming(false)}
                className="text-sm font-semibold text-body"
              >
                {FLOW_COPY.payBack}
              </button>
              <button
                type="button"
                data-testid="pay-confirm"
                onClick={() => setProcessing(true)}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
              >
                {FLOW_COPY.payConfirmUpfront}
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
      <div className="text-2xs font-bold uppercase tracking-wider text-ink">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
