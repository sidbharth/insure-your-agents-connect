/**
 * Connect flow, final step — signature (route /flow/sign). Signing collects
 * the premium through the real payment port and activates the enrollments,
 * so cover attaches the moment the signature lands. The stake settlement
 * path currently records the choice and settles like upfront; the staking
 * mechanics arrive in a later iteration.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../../components/LatencyTheater';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { EXCLUSION_WALL, FLOW_COPY } from '../../data/copy';
import { formatUsd } from '../../lib/money';
import { executePayment, PaymentAbortedError } from '../../lib/payments';
import { useStore } from '../../store';
import { capUsdFor } from '../purchase/enroll';
import {
  getAgreedPages,
  getPaymentMethod,
  getSelectedAgentIds,
} from './flowState';

export default function FlowSign() {
  const enrollments = useStore((s) => s.enrollments);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const selected = getSelectedAgentIds();
  const method = getPaymentMethod() ?? 'upfront';

  // The signature page is reachable only after all six coverages are agreed.
  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
    else if (getAgreedPages() < 6) navigate(`/flow/terms/${getAgreedPages() + 1}`, { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0 || getAgreedPages() < 6) return null;

  const live = enrollments.filter(
    (e) => selected.includes(e.agentId) && e.terminatedAt === undefined,
  );
  const totalCoverUsd = selected.reduce((a, id) => a + capUsdFor(state, id), 0);
  const totalPremiumUsd = live.reduce((a, e) => a + e.premiumUsd, 0);

  const sign = async () => {
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
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowSign">
      <div className="mx-auto max-w-[680px]">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {FLOW_COPY.signTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{FLOW_COPY.signSub}</p>

        <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <SummaryCell
              label={FLOW_COPY.signLabels.agents}
              value={String(selected.length)}
            />
            <SummaryCell
              label={FLOW_COPY.signLabels.cover}
              value={formatUsd(totalCoverUsd)}
              mono
            />
            <SummaryCell
              label={FLOW_COPY.signLabels.premium}
              value={formatUsd(totalPremiumUsd)}
              mono
            />
            <SummaryCell
              label={FLOW_COPY.signLabels.payment}
              value={FLOW_COPY.paymentMethodNames[method]}
            />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="text-2xs font-bold uppercase tracking-wider text-bad">
              {FLOW_COPY.signExclusions}
            </div>
            <ul className="mt-2 flex flex-col gap-2" data-testid="sign-exclusions">
              {EXCLUSION_WALL.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-body">
                  <span className="mt-0.5 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-bad-bg text-[9px] font-bold text-bad">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-3">
            <input
              type="checkbox"
              data-testid="sign-acknowledge"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-[#00c988]"
            />
            <span className="text-sm font-semibold text-ink">{FLOW_COPY.signAck}</span>
          </label>

          <p
            className="mt-4 border-t border-line pt-4 text-sm text-body"
            data-testid="sign-statement"
          >
            {FLOW_COPY.signStatement}
          </p>

          {signing ? (
            <LatencyTheater
              className="mt-4"
              title={FLOW_COPY.signTheaterTitle}
              steps={FLOW_COPY.signSteps.map((label) => ({ label }))}
              totalMs={2600}
              onDone={() => {
                void sign();
              }}
            />
          ) : (
            <div className="mt-4 flex items-center justify-end gap-3">
              <SimulatedBadge />
              <button
                type="button"
                data-testid="flow-sign"
                disabled={!acknowledged}
                onClick={() => setSigning(true)}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
              >
                {FLOW_COPY.signButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold text-ink ${mono ? 'num' : ''}`}>
        {value}
      </div>
    </div>
  );
}
