/**
 * Connect flow, step 4 — payment choice (route /flow/pay): pay upfront or
 * pay with stake. Either choice leads into the coverage disclosures; the
 * premium itself moves at signing. Stake mechanics land in a later
 * iteration; the choice is recorded now.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_COPY } from '../../data/copy';
import {
  getSelectedAgentIds,
  setPaymentMethod,
  type FlowPaymentMethod,
} from './flowState';

export default function FlowPay() {
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0) return null;

  const choose = (method: FlowPaymentMethod) => {
    setPaymentMethod(method);
    navigate('/flow/terms/1');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowPay">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">{FLOW_COPY.payTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{FLOW_COPY.paySub}</p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        <PaymentOption
          testId="pay-upfront"
          title={FLOW_COPY.payUpfrontTitle}
          body={FLOW_COPY.payUpfrontBody}
          onChoose={() => choose('upfront')}
        />
        <PaymentOption
          testId="pay-stake"
          title={FLOW_COPY.payStakeTitle}
          body={FLOW_COPY.payStakeBody}
          onChoose={() => choose('stake')}
        />
      </div>
    </div>
  );
}

function PaymentOption({
  testId,
  title,
  body,
  onChoose,
}: {
  testId: string;
  title: string;
  body: string;
  onChoose: () => void;
}) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-1 flex-1 text-xs text-muted">{body}</p>
      <button
        type="button"
        data-testid={testId}
        onClick={onChoose}
        className="mt-4 self-start rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
      >
        {FLOW_COPY.payChoose}
      </button>
    </div>
  );
}
