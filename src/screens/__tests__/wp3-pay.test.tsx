/**
 * WP-3 — Screen 7.8 "Deposit requirement now" (REQ-7.8.1/2/3, AC-7).
 * Order summary + settlement line in N at the live price · quarterly toggle
 * with the overdue note · retention preview worked examples marked "not
 * collected today" · preflight gates with EACH named blocker · pay →
 * re-fetched rate is stamped as conversionRateAtPayment + effectiveAt ·
 * activation ceremony · policy schedule = the enrollment record itself.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pay, { buildPreflightView } from '../Pay';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { setLatencyTestMode } from '../../lib/latency';
import { paymentPreflight } from '../../lib/payments';
import { WIZARD_AGENT } from '../../data/seed';
import { enrollAgent, prepareImportedAgent } from '../purchase/enroll';

function renderPay() {
  return render(
    <MemoryRouter initialEntries={['/pay']}>
      <Pay />
    </MemoryRouter>,
  );
}

/** Wizard agent fully prepared and enrolled (the happy path from 7.6/7.7). */
function enrollWizard(): void {
  prepareImportedAgent(WIZARD_AGENT.id);
  enrollAgent(WIZARD_AGENT.id);
}

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  setLatencyTestMode(true);
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

describe('7.8 — summary phase', () => {
  it('shows the order summary, total and the settlement line in N', () => {
    enrollWizard();
    renderPay();
    expect(screen.getByTestId('pay-framing')).toBeInTheDocument();
    const row = screen.getByTestId(`pay-row-${WIZARD_AGENT.id}`);
    expect(row).toHaveTextContent('Procurement-Bot');
    expect(row).toHaveTextContent('0.6%');
    expect(row).toHaveTextContent('$300');
    expect(row).toHaveTextContent('Ready to bind');
    expect(screen.getByTestId('pay-total')).toHaveTextContent('$300');
    expect(screen.getByTestId('pay-total')).toHaveTextContent('≈ 100 $NEAR');
    const settlement = screen.getByTestId('settlement-line');
    expect(settlement).toHaveTextContent('100 $NEAR');
    expect(settlement).toHaveTextContent(/re-fetched immediately before payment/);
  });

  it('quarterly toggle divides the due-N by four and shows the overdue note', () => {
    enrollWizard();
    renderPay();
    const quarterly = screen.getByTestId('plan-quarterly');
    expect(quarterly).toHaveTextContent('4 × 25 $NEAR');
    fireEvent.click(quarterly);
    expect(quarterly).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('overdue-note')).toHaveTextContent(
      /more than 15 days overdue/,
    );
  });

  it('retention preview examples are computed at the displayed price, not collected today', () => {
    enrollWizard();
    renderPay();
    const retention = screen.getByTestId('retention-preview');
    expect(retention).toHaveTextContent(/not collected today/i);
    expect(retention).toHaveTextContent('$30,000 loss → you bear $1,500'); // 500 N floor at $3.00
    expect(retention).toHaveTextContent('$200,000 loss → you bear $4,000'); // 2%
  });

  it('payment method is the simulated demo wallet', () => {
    enrollWizard();
    renderPay();
    const method = screen.getByTestId('payment-method');
    expect(method).toHaveTextContent('Operator wallet');
    expect(method).toHaveTextContent('near-foundation.near');
    expect(within(method).getByTestId('simulated-badge')).toBeInTheDocument();
  });
});

describe('7.8 — preflight blockers (REQ-7.8.1, AC-7)', () => {
  it('buildPreflightView produces every named blocker for an unprepared agent', () => {
    // enroll WITHOUT the prep: no countersignature, no ownership verification
    enrollAgent(WIZARD_AGENT.id);
    const s = useStore.getState();
    s.setTier1(WIZARD_AGENT.id, 'whitelist', false);
    const view = buildPreflightView(useStore.getState(), [WIZARD_AGENT.id], false);
    const pre = paymentPreflight(view, 'initial-premium');
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      const keys = pre.blockers.map((b) => b.key);
      expect(keys).toContain(`ownership-not-verified:${WIZARD_AGENT.id}`);
      expect(keys).toContain(`mandate-not-countersigned:${WIZARD_AGENT.id}`);
      expect(keys).toContain(`tier1-gate-off:${WIZARD_AGENT.id}`);
      expect(keys).toContain('payment-method-not-selected');
    }
  });

  it('clicking Pay renders each named blocker; nothing activates', () => {
    enrollAgent(WIZARD_AGENT.id); // un-prepared: mandate uncountersigned? (wizard has seeded uncountersigned mandate)
    useStore.getState().setTier1(WIZARD_AGENT.id, 'actionLogging', false);
    renderPay();
    fireEvent.click(screen.getByTestId('method-checkbox')); // deselect payment method
    fireEvent.click(screen.getByTestId('pay-button'));
    const panel = screen.getByTestId('pay-blockers');
    expect(panel).toHaveTextContent('Activation blocked');
    expect(
      within(panel).getByTestId(`blocker-ownership-not-verified:${WIZARD_AGENT.id}`),
    ).toHaveTextContent(/ownership challenge not completed/);
    expect(
      within(panel).getByTestId(`blocker-mandate-not-countersigned:${WIZARD_AGENT.id}`),
    ).toHaveTextContent(/no countersignature, no cover/);
    expect(
      within(panel).getByTestId(`blocker-tier1-gate-off:${WIZARD_AGENT.id}`),
    ).toHaveTextContent(/not insurable at any price/);
    expect(
      within(panel).getByTestId('blocker-payment-method-not-selected'),
    ).toHaveTextContent(/No payment method selected/);
    // nothing paid, nothing active
    const s = useStore.getState();
    expect(s.agents.find((a) => a.id === WIZARD_AGENT.id)?.status).not.toBe('Active');
    expect(s.enrollments[0].effectiveAt).toBe(0);
  });

  it('a missing config hash produces the hash-not-registered blocker', () => {
    const view = buildPreflightView(useStore.getState(), [WIZARD_AGENT.id], true);
    view.agents[0].configHash = '';
    const pre = paymentPreflight(view, 'initial-premium');
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.blockers.map((b) => b.key)).toContain(
        `hash-not-registered:${WIZARD_AGENT.id}`,
      );
    }
  });
});

describe('7.8 — pay and activate (REQ-7.8.2, AC-7)', () => {
  it('pays at the re-fetched rate, stamps conversionRateAtPayment + effectiveAt, activates', async () => {
    enrollWizard();
    // the pre-payment refetch returns a NEW price — the stamp must be 3.25
    setPriceFetchFn(async () => 3.25);
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );

    const s = useStore.getState();
    const enrollment = s.enrollments.find((e) => e.agentId === WIZARD_AGENT.id)!;
    expect(enrollment.conversionRateAtPayment).toBe(3.25); // post-refetch rate
    expect(enrollment.effectiveAt).toBeGreaterThan(0);
    expect(enrollment.paymentHistory).toHaveLength(1);
    expect(enrollment.paymentHistory[0].rateUsed).toBe(3.25);
    expect(s.agents.find((a) => a.id === WIZARD_AGENT.id)?.status).toBe('Active');

    // ceremony: premium recorded in N at the re-fetched rate + three-records line
    expect(screen.getByTestId('premium-recorded-line')).toHaveTextContent('$3.25');
    expect(screen.getByTestId('three-records-line')).toBeInTheDocument();
    const card = screen.getByTestId(`activated-card-${WIZARD_AGENT.id}`);
    expect(within(card).getByTestId('status-pill')).toHaveTextContent('Active');
    expect(within(card).getByTestId('effective-line')).toHaveTextContent(/effective \d{4}-/);
  });

  it('the policy schedule is the enrollment record: rate stamp, effective + renewal', async () => {
    enrollWizard();
    setPriceFetchFn(async () => 3.25);
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('view-policy-schedule')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('view-policy-schedule'));
    const schedule = screen.getByTestId('policy-schedule');
    expect(schedule).toHaveTextContent('Procurement-Bot');
    expect(schedule).toHaveTextContent('0.6%');
    expect(schedule).toHaveTextContent('$300');
    expect(schedule).toHaveTextContent('1 $NEAR = $3.25'); // conversion rate at payment
    expect(schedule).toHaveTextContent('countersigned by Aria Chen');
    expect(within(schedule).getByTestId('schedule-caption')).toHaveTextContent(
      /This enrollment record constitutes the policy schedule\./,
    );
    fireEvent.click(screen.getByTestId('close-schedule'));
    expect(screen.queryByTestId('policy-schedule')).not.toBeInTheDocument();
  });

  it('paying debits the demo wallet by the N amount at the payment rate', async () => {
    enrollWizard();
    const before = useStore.getState().operator.walletBalance;
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );
    // $300 at $3.00 = 100 N
    expect(useStore.getState().operator.walletBalance).toBeCloseTo(before - 100, 6);
  });
});
