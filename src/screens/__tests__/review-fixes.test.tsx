/**
 * Regression tests for the review-fix batch (High findings #1–#8):
 *  #1 unverified operator keeps the +0.4% KYB surcharge at Quote/enrollment
 *  #2 claim settlement transfers the amount re-adjudicated at the
 *     post-refetch rate and persists the payment-time math on the claim
 *  #3 quarterly plan charges one quarter today + schedules 3 installments
 *  #4 Pay never re-renders an armed summary while a payment is in flight
 *  #5 editing a mandate draft after save invalidates the pending edit
 *  #6 a reset() mid-payment aborts the payment before any money moves
 *  #7 revoking verification suspends Active agents; restore cures them
 *  #8 cures are cause-specific and resolve the underlying condition
 *  (+ #9: repeated initial payments are idempotent in the store layer)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import Pay from '../Pay';
import { buildEvidenceChecklist } from '../../data/incidents';
import { WIZARD_AGENT } from '../../data/seed';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { setLatencyTestMode } from '../../lib/latency';
import { premiumCurrentAt } from '../../lib/conditions';
import { executePayment, PaymentAbortedError } from '../../lib/payments';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { enrollAgent, prepareImportedAgent, pricingInputFor, latestMandate } from '../purchase/enroll';

const AGENT_ID = 'procurement-bot';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

function renderPay() {
  return render(
    <MemoryRouter initialEntries={['/pay']}>
      <Pay />
    </MemoryRouter>,
  );
}

function enrollWizard(): void {
  prepareImportedAgent(WIZARD_AGENT.id);
  enrollAgent(WIZARD_AGENT.id);
}

/** Enrolled + mandate in force at the seed epoch (live feed, NOT pinned). */
function enrollForClaims(agentId = AGENT_ID): void {
  const s = useStore.getState();
  s.saveMandate(agentId, testMandate());
  s.addEnrollment(testEnrollment({ agentId }));
}

/** Inject a scenario, open the claim, stamp it through to determination. */
function openDeterminedClaim(lossUsd?: number): string {
  const s = useStore.getState();
  s.injectIncident('S-09', AGENT_ID, lossUsd);
  const incident = useStore.getState().incidents.at(-1)!;
  const claimId = useStore.getState().openClaim(incident.id);
  const claim = () => useStore.getState().claims.find((c) => c.id === claimId)!;
  useStore.getState().updateClaim(claimId, {
    evidence: buildEvidenceChecklist('S-09').map((e) =>
      e.status === 'missing' ? { ...e, status: 'uploaded' as const } : e,
    ),
  });
  const now = demoNow();
  const anchors = {
    ...claim().clockState.anchors,
    notifiedAt: now,
    acknowledgedAt: now,
    packageReceivedAt: now,
    packageCompleteAt: now,
    determinedAt: now,
  };
  const next = { ...claim().clockState, anchors };
  useStore.getState().setClockState(claimId, { ...next, phase: phaseFromAnchors(next) });
  return claimId;
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

// ---------------------------------------------------------------------------
// Fix #1 — unverified operator keeps the +0.4% KYB surcharge
// ---------------------------------------------------------------------------

describe('fix #1 — KYB surcharge for unverified operators (Quote/enrollment)', () => {
  it('pricingInputFor prices KYB as skipped when the operator is unverified', () => {
    useStore.getState().revokeVerification();
    const s = useStore.getState();
    const agent = s.agents.find((a) => a.id === AGENT_ID)!;
    const input = pricingInputFor(s, agent, latestMandate(s, AGENT_ID), false);
    // The agent's own kyb flag is on, but the operator is unverified — the
    // priced input mirrors the wizard's buildPricingInput semantics.
    expect(agent.controls.tier2.kyb).toBe(true);
    expect(input.tier2.kyb).toBe(false);
  });

  it('enrollment premium includes the +0.4% surcharge: $500, not $300', () => {
    useStore.getState().revokeVerification();
    enrollWizard();
    const e = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    // (0.6 + 0.4)% × $50,000 = $500
    expect(e.premiumUsd).toBe(500);
  });

  it('a verified operator still prices at the base 0.6% ($300)', () => {
    enrollWizard();
    const e = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    expect(e.premiumUsd).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Fix #2 — settlement transfers the post-refetch re-adjudicated amount
// ---------------------------------------------------------------------------

describe('fix #2 — claim settlement at the post-refetch rate', () => {
  it('re-adjudicates at the refetched rate: retention, payout and N all move', async () => {
    enrollForClaims();
    const claimId = openDeterminedClaim(40_000);
    renderAt(`/claim/${claimId}`);
    // On screen at $3.00: retention max(500×3, 2%×40k) = $1,500 → $38,500.
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$38,500');

    // The feed moves to $4.00 before the payment's mandatory refetch.
    setPriceFetchFn(async () => 4.0);
    const walletBefore = useStore.getState().operator.walletBalance;
    fireEvent.click(screen.getByTestId('accept-payment'));
    await waitFor(() =>
      expect(screen.getByTestId('payment-accepted')).toBeInTheDocument(),
    );

    // At $4.00 retention = max(500×4, 800) = $2,000 → payout $38,000 → 9,500 N.
    expect(useStore.getState().operator.walletBalance).toBeCloseTo(
      walletBefore + 9_500,
      6,
    );
    // The payment-time adjudication is persisted on the claim.
    const claim = useStore.getState().claims.find((c) => c.id === claimId)!;
    expect(claim.adjudication?.math?.rateUsed).toBe(4);
    expect(claim.adjudication?.math?.payoutUsd).toBe(38_000);
  });

  it('a paid claim renders the persisted snapshot, immune to later feed moves', async () => {
    enrollForClaims();
    const claimId = openDeterminedClaim(40_000);
    setPriceFetchFn(async () => 4.0);
    renderAt(`/claim/${claimId}`);
    fireEvent.click(screen.getByTestId('accept-payment'));
    await waitFor(() =>
      expect(screen.getByTestId('payment-accepted')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$38,000');

    // The feed keeps moving after payment — the paid claim must not.
    setPriceFetchFn(async () => 7.5);
    await act(async () => {
      await useStore.getState().refetchNow();
    });
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$38,000');
    expect(screen.getByTestId('outcome-payout-n')).toHaveTextContent('1 $NEAR = $4.00');
  });
});

// ---------------------------------------------------------------------------
// Fix #3 — quarterly plan is real: one quarter today + 3 scheduled
// ---------------------------------------------------------------------------

describe('fix #3 — quarterly payment plan', () => {
  it('charges one quarter today and schedules three future installments', async () => {
    enrollWizard();
    const before = useStore.getState().operator.walletBalance;
    renderPay();
    fireEvent.click(screen.getByTestId('plan-quarterly'));
    // Due-today line reflects the quarterly amount ($75 ≈ 25 N at $3.00).
    expect(screen.getByTestId('settlement-line')).toHaveTextContent('25 $NEAR');
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );

    // Wallet debited one quarter: $75 / $3.00 = 25 N.
    expect(useStore.getState().operator.walletBalance).toBeCloseTo(before - 25, 6);

    const e = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    expect(e.paymentPlan).toBe('quarterly');
    const paid = e.paymentHistory.filter((i) => i.paidAt !== undefined);
    const due = e.paymentHistory.filter((i) => i.paidAt === undefined);
    expect(paid).toHaveLength(1);
    expect(paid[0].amountUsd).toBe(75);
    expect(due).toHaveLength(3);
    for (const item of due) {
      expect(item.kind).toBe('installment');
      expect(item.amountUsd).toBe(75);
      expect(item.dueAt).toBeGreaterThan(e.effectiveAt); // future, not overdue
    }
    // The >15-day rule holds naturally: premium is current right now.
    expect(premiumCurrentAt(e, demoNow())).toBe(true);
  });

  it('annual plan still records the single full premium', async () => {
    enrollWizard();
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );
    const e = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    expect(e.paymentPlan).toBe('annual');
    expect(e.paymentHistory).toHaveLength(1);
    expect(e.paymentHistory[0].amountUsd).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Fix #4 — no armed summary while a payment is in flight
// ---------------------------------------------------------------------------

describe('fix #4 — Pay double-payment window', () => {
  it('stays in the paying state until the receipt lands, even after the ceremony', async () => {
    enrollWizard();
    // Slow refetch: the ceremony (instant in test mode) finishes FIRST.
    let releaseFetch: (v: number) => void = () => {};
    setPriceFetchFn(() => new Promise<number>((r) => (releaseFetch = r)));
    const before = useStore.getState().operator.walletBalance;
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    // Receipt not landed: neither an armed summary nor a premature ceremony.
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activation-ceremony')).not.toBeInTheDocument();
    expect(screen.getByTestId('latency-theater')).toBeInTheDocument();

    await act(async () => {
      releaseFetch(3.0);
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );
    expect(useStore.getState().operator.walletBalance).toBeCloseTo(before - 100, 6);
  });
});

// ---------------------------------------------------------------------------
// Fix #5 — pending mandate edit is immutable once saved
// ---------------------------------------------------------------------------

describe('fix #5 — mandate edit: draft changes invalidate the saved edit', () => {
  it('editing after save closes the sheet and clears the pending edit', () => {
    renderAt(`/mandate?edit=${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('save-reprice'));
    expect(screen.getByTestId('repricing-sheet')).toBeInTheDocument();
    expect(useStore.getState().pendingEdits[AGENT_ID]).toBeDefined();

    // Diverge the draft AFTER saving — the stale sheet must not stay payable.
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '200000' },
    });
    expect(screen.queryByTestId('repricing-sheet')).not.toBeInTheDocument();
    expect(useStore.getState().pendingEdits[AGENT_ID]).toBeUndefined();
  });

  it('payment consumes the stored pending edit, not the local draft', async () => {
    renderAt(`/mandate?edit=${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('save-reprice'));
    fireEvent.click(screen.getByTestId('pay-difference'));
    await waitFor(() =>
      expect(screen.getByTestId('edit-applied')).toBeInTheDocument(),
    );
    const versions = useStore.getState().mandates[AGENT_ID];
    expect(versions[versions.length - 1].caps.perTx).toBe(100000);
  });
});

// ---------------------------------------------------------------------------
// Fix #6 — reset() mid-payment aborts before money moves
// ---------------------------------------------------------------------------

describe('fix #6 — reset generation token', () => {
  it('reset() bumps the monotonic resetGeneration', () => {
    const before = useStore.getState().resetGeneration;
    useStore.getState().reset();
    expect(useStore.getState().resetGeneration).toBe(before + 1);
  });

  it('a payment in flight across reset() aborts and never debits the fresh seed', async () => {
    enrollWizard();
    const gen = useStore.getState().resetGeneration;
    // The refetch itself triggers the reset — the classic mid-flight race.
    setPriceFetchFn(async () => {
      useStore.getState().reset();
      return 3.0;
    });
    await expect(
      executePayment(
        'initial',
        300,
        { agentIds: [WIZARD_AGENT.id] },
        { stale: () => useStore.getState().resetGeneration !== gen },
      ),
    ).rejects.toThrow(PaymentAbortedError);
    // Fresh seed untouched: no payment history, wallet at the seed balance.
    const s = useStore.getState();
    expect(s.enrollments).toHaveLength(0);
    expect(s.operator.walletBalance).toBe(2_000);
  });
});

// ---------------------------------------------------------------------------
// Fix #7 — verification withdrawal is a suspension trigger
// ---------------------------------------------------------------------------

describe('fix #7 — revoke suspends Active agents; restore cures', () => {
  it('revoke opens per-agent "verification withdrawn" suspensions; restore closes them', () => {
    const s = useStore.getState();
    s.setAgentStatus(AGENT_ID, 'Active');
    s.addEnrollment(testEnrollment({ agentId: AGENT_ID }));
    useStore.getState().setPanelOpen(true);
    renderAt('/dashboard');

    fireEvent.click(screen.getByTestId('verification-revoke'));
    const suspended = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(
      suspended.suspensionHistory.some(
        (iv) => iv.to === undefined && iv.reason === 'verification withdrawn',
      ),
    ).toBe(true);
    // Draft agents (never Active) are untouched.
    const draft = useStore.getState().agents.find((a) => a.id === 'relay-bot')!;
    expect(draft.suspensionHistory).toHaveLength(0);
    // Event-time verification history is still interval-written.
    expect(
      useStore
        .getState()
        .operator.verificationHistory.every((iv) => !iv.verified || iv.to !== undefined),
    ).toBe(true);

    fireEvent.click(screen.getByTestId('verification-restore'));
    const restored = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(restored.suspensionHistory.every((iv) => iv.to !== undefined)).toBe(true);
    expect(restored.status).toBe('Active');
    expect(
      useStore
        .getState()
        .operator.verificationHistory.some((iv) => iv.verified && iv.to === undefined),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix #8 — cause-specific cures resolve the underlying condition
// ---------------------------------------------------------------------------

describe('fix #8 — cause-specific cures', () => {
  it('unsuspendAgent(reason) closes only that reason; Active only when none remain', () => {
    const s = useStore.getState();
    s.setAgentStatus(AGENT_ID, 'Active');
    const at = demoNow();
    s.suspendAgent(AGENT_ID, 'configuration hash mismatch', at);
    s.suspendAgent(AGENT_ID, 'premium >15 days overdue', at + 1);

    useStore.getState().unsuspendAgent(AGENT_ID, at + 2, 'configuration hash mismatch');
    let agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    // The other trigger is still open — the agent must NOT flip Active.
    expect(agent.status).toBe('Suspended');
    expect(
      agent.suspensionHistory.filter((iv) => iv.to === undefined).map((iv) => iv.reason),
    ).toEqual(['premium >15 days overdue']);

    useStore.getState().unsuspendAgent(AGENT_ID, at + 3, 'premium >15 days overdue');
    agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(agent.status).toBe('Active');
    expect(agent.suspensionHistory.every((iv) => iv.to !== undefined)).toBe(true);
  });

  it('curing premium-overdue settles the unpaid item so future claims pass', () => {
    const s = useStore.getState();
    s.setAgentStatus(AGENT_ID, 'Active');
    s.addEnrollment(testEnrollment({ agentId: AGENT_ID }));
    useStore.getState().setPanelOpen(true);
    renderAt('/dashboard');

    fireEvent.click(screen.getByTestId('force-premium-overdue'));
    let e = useStore.getState().enrollments.find((x) => x.agentId === AGENT_ID)!;
    expect(premiumCurrentAt(e, demoNow())).toBe(false);

    fireEvent.click(screen.getByTestId('force-premium-overdue'));
    e = useStore.getState().enrollments.find((x) => x.agentId === AGENT_ID)!;
    // The underlying condition is resolved, not just the pill.
    expect(e.paymentHistory.every((i) => i.paidAt !== undefined)).toBe(true);
    expect(premiumCurrentAt(e, demoNow())).toBe(true);
    const agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(agent.status).toBe('Active');
  });

  it('dashboard cure resolves only the displayed cause', () => {
    const s = useStore.getState();
    s.setAgentStatus(AGENT_ID, 'Active');
    s.addEnrollment(testEnrollment({ agentId: AGENT_ID }));
    const at = useStore.getState().enrollments[0].effectiveAt + 1;
    useStore.getState().tripGate(AGENT_ID, 'transferCaps', at);
    useStore.getState().suspendAgent(AGENT_ID, 'Transfer caps gate failed', at);

    renderAt('/policies');
    fireEvent.click(screen.getByTestId('cure-button'));
    const agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(agent.status).toBe('Active');
    expect(agent.controls.tier1.transferCaps).toBe(true);
    expect(agent.gateHistory.transferCaps.at(-1)?.to).toBeUndefined();
    expect(agent.suspensionHistory.at(-1)?.to).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fix #9 — repeated initial payments are idempotent
// ---------------------------------------------------------------------------

describe('fix #9 — initial payment idempotency', () => {
  it('an already-activated enrollment cannot be charged or re-anchored again', async () => {
    enrollWizard();
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );
    const e1 = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    const wallet1 = useStore.getState().operator.walletBalance;

    // A repeat initial payment (e.g. a stale Pay screen) records nothing.
    const receipt = await executePayment('initial', 300, {
      agentIds: [WIZARD_AGENT.id],
    });
    useStore.getState().activateEnrollments(receipt);

    const e2 = useStore.getState().enrollments.find((x) => x.agentId === WIZARD_AGENT.id)!;
    expect(useStore.getState().operator.walletBalance).toBe(wallet1);
    expect(e2.paymentHistory).toHaveLength(e1.paymentHistory.length);
    expect(e2.effectiveAt).toBe(e1.effectiveAt); // never re-anchored
    expect(e2.renewalAt).toBe(e1.renewalAt);
  });

  it('the Pay screen lists only enrollments still awaiting their initial payment', async () => {
    enrollWizard();
    renderPay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('activation-ceremony')).toBeInTheDocument(),
    );
    cleanup();
    // Re-visit Pay after activation: nothing left to charge.
    renderPay();
    expect(screen.queryByTestId(`pay-row-${WIZARD_AGENT.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('pay-button')).toBeDisabled();
  });
});
