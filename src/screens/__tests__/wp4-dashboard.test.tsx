/**
 * WP-4 tests — screen 7.9 My policies (plan §10 WP-4):
 *  - AC-12: suspension flips the pill with the cause named; Cure restores
 *    Active and reopens the tripped gate; other agents' rows are unaffected.
 *  - AC-11: a reported near-miss appears in the feed with its credit tag
 *    (hover copy) and moves the renewal preview by exactly −0.01%.
 *  - AC-8 (read side): a pending mandate edit renders the visible label with
 *    the delta in both currencies; committing/clearing removes it.
 *  - REQ-7.2.2: unverified strip → Complete verification → pro-rata refund
 *    banner (T5.3, future events only).
 *  - §9b: de-enroll returns unused premium pro rata (D7) — or $0 with the
 *    reason named when a claim/incident exists on the agent (D7 exception).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { testEnrollment, testIncident, testMandate } from '../../lib/__tests__/fixtures';
import type { RateLine } from '../../store/types';

const AGENT_ID = 'procurement-bot';

/** A 0.6% base ladder so the renewal preview has room above the 0.45% floor. */
const LADDER: RateLine[] = [
  { label: 'Base rate', points: 0.6, clause: 'Appendix 3', group: 'ladder' },
];

function enroll(agentId = AGENT_ID) {
  useStore.getState().setAgentStatus(agentId, 'Active');
  useStore.getState().addEnrollment(
    testEnrollment({ agentId, rateBreakdown: LADDER }),
  );
}

function renderPolicies() {
  return render(
    <MemoryRouter initialEntries={['/policies']}>
      <AppShell />
    </MemoryRouter>,
  );
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

describe('7.9 dashboard — rows', () => {
  it('shows the empty state before any enrollment', () => {
    renderPolicies();
    expect(screen.getByText(/No policies yet/i)).toBeInTheDocument();
  });

  it('renders one row per enrolled agent with cap, rate, premium and status', () => {
    enroll();
    renderPolicies();
    const row = screen.getByTestId(`policy-row-${AGENT_ID}`);
    expect(within(row).getByTestId('status-pill')).toHaveAttribute('data-status', 'Active');
    expect(within(row).getByTestId('row-rate').textContent).toBe('0.6%');
    expect(row.textContent).toMatch(/\$50,000/);
    expect(row.textContent).toMatch(/\$300/);
  });
});

describe('AC-12 — suspension and cure', () => {
  it('suspension flips the pill with the cause named; Cure restores Active and reopens the gate', () => {
    enroll();
    enroll('relay-bot');
    const at = useStore.getState().enrollments[0].effectiveAt + 1;
    useStore.getState().tripGate(AGENT_ID, 'transferCaps', at);
    useStore.getState().suspendAgent(AGENT_ID, 'Transfer caps gate failed', at);

    renderPolicies();
    const row = screen.getByTestId(`policy-row-${AGENT_ID}`);
    expect(within(row).getByTestId('status-pill')).toHaveAttribute(
      'data-status',
      'Suspended',
    );
    expect(within(row).getByTestId('suspension-cause').textContent).toMatch(
      /Transfer caps gate failed/,
    );
    // the strip carries the reassurance copy
    expect(within(row).getByTestId('suspension-strip').textContent).toMatch(
      /prior events remain claimable/i,
    );
    // the other agent's row is unaffected
    const other = screen.getByTestId('policy-row-relay-bot');
    expect(within(other).getByTestId('status-pill')).toHaveAttribute(
      'data-status',
      'Active',
    );

    fireEvent.click(within(row).getByTestId('cure-button'));

    const agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(agent.status).toBe('Active');
    // suspension interval closed, gate interval reopened (interval writes, AC-12)
    expect(agent.suspensionHistory.at(-1)?.to).toBeDefined();
    expect(agent.gateHistory.transferCaps.at(-1)?.to).toBeUndefined();
    expect(agent.controls.tier1.transferCaps).toBe(true);
    expect(
      within(screen.getByTestId(`policy-row-${AGENT_ID}`)).getByTestId('status-pill'),
    ).toHaveAttribute('data-status', 'Active');
  });
});

describe('AC-11 — near-miss reporting and renewal preview', () => {
  it('a reported near-miss appears with its credit tag and hover copy', () => {
    enroll();
    renderPolicies();
    expect(screen.queryAllByTestId('near-miss-item')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('report-near-miss'));

    const items = screen.getAllByTestId('near-miss-item');
    expect(items).toHaveLength(1);
    const tag = within(items[0]).getByTestId('near-miss-credit-tag');
    expect(tag.textContent).toMatch(/\+ data credit at renewal/);
    expect(tag).toHaveAttribute(
      'title',
      expect.stringMatching(/within 7 days earns a renewal credit/i),
    );
  });

  it('each near-miss moves the renewal preview by exactly −0.01%', () => {
    enroll();
    renderPolicies();
    // ladder 0.6% − 0.05% clean-year credit = 0.55% before any near-miss
    expect(screen.getByTestId('row-renewal-preview').textContent).toMatch(/0\.55%/);

    fireEvent.click(screen.getByTestId('report-near-miss'));
    expect(screen.getByTestId('row-renewal-preview').textContent).toMatch(/0\.54%/);
    expect(screen.getByTestId('row-renewal-preview').textContent).toMatch(
      /−0\.01% × 1 near-miss credit/,
    );

    fireEvent.click(screen.getByTestId('report-near-miss'));
    expect(screen.getByTestId('row-renewal-preview').textContent).toMatch(/0\.53%/);
  });
});

describe('AC-8 (read side) — pending mandate edit label', () => {
  it('shows the pending delta in both currencies and the T5.2 rule', () => {
    enroll();
    useStore
      .getState()
      .setPendingEdit(AGENT_ID, { draft: testMandate(), deltaUsd: 120, deltaN: 40 });
    renderPolicies();

    const label = screen.getByTestId('pending-edit-label');
    expect(label.textContent).toMatch(/\+\$120/);
    expect(label.textContent).toMatch(/40/);
    expect(label.textContent).toMatch(/current mandate governs cover/i);
  });

  it('clearing the pending edit removes the label', () => {
    enroll();
    useStore
      .getState()
      .setPendingEdit(AGENT_ID, { draft: testMandate(), deltaUsd: 120, deltaN: 40 });
    renderPolicies();
    expect(screen.getByTestId('pending-edit-label')).toBeInTheDocument();

    act(() => useStore.getState().clearPendingEdit(AGENT_ID));
    expect(screen.queryByTestId('pending-edit-label')).not.toBeInTheDocument();
  });
});

describe('REQ-7.2.2 — verification nudge with pro-rata refund', () => {
  it('unverified strip → Complete verification → verified + refund banner (T5.3)', async () => {
    enroll();
    useStore.getState().revokeVerification();
    renderPolicies();
    expect(screen.getByTestId('dashboard-verify-strip')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dashboard-complete-verification'));
    await waitFor(() =>
      expect(screen.getByTestId('verification-refund')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('verification-refund').textContent).toMatch(
      /pro rata from the verification date/i,
    );
    expect(screen.queryByTestId('dashboard-verify-strip')).not.toBeInTheDocument();
    const history = useStore.getState().operator.verificationHistory;
    expect(history.at(-1)?.verified).toBe(true);
    expect(history.at(-1)?.to).toBeUndefined();
  });
});

describe('§9b — de-enroll', () => {
  it('confirms with a pro-rata refund (D7) and terminates the enrollment', () => {
    enroll();
    renderPolicies();

    fireEvent.click(screen.getByTestId('de-enroll'));
    const confirm = screen.getByTestId('de-enroll-confirm');
    expect(confirm.textContent).toMatch(/past events remain claimable/i);
    expect(confirm.textContent).toMatch(/pro rata/i);
    expect(screen.queryByTestId('de-enroll-zero-refund')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('de-enroll-confirm-button'));

    const state = useStore.getState();
    expect(state.agents.find((a) => a.id === AGENT_ID)?.status).toBe('De-enrolled');
    expect(state.enrollments[0].terminatedAt).toBeDefined();
    expect(screen.getByTestId('de-enroll-note')).toBeInTheDocument();
  });

  it('shows $0 with the D7 exception named when an incident exists on the agent', () => {
    enroll();
    useStore.getState().addIncident(testIncident('S-03'));
    renderPolicies();

    fireEvent.click(screen.getByTestId('de-enroll'));
    const zero = screen.getByTestId('de-enroll-zero-refund');
    expect(zero.textContent).toMatch(/\$0/);
    expect(zero.textContent).toMatch(/claim has been paid or noticed/i);

    fireEvent.click(screen.getByTestId('de-enroll-confirm-button'));
    expect(screen.getByTestId('de-enroll-note').textContent).toMatch(/\$0/);
  });
});

describe('presenter arming — Simulate incident', () => {
  it('renders the Simulate incident button only when the presenter is armed', () => {
    enroll();
    renderPolicies();
    expect(screen.queryByTestId('simulate-incident')).not.toBeInTheDocument();

    act(() => {
      useStore.setState((s) => ({ presenter: { ...s.presenter, armed: true } }));
    });
    expect(screen.getByTestId('simulate-incident')).toBeInTheDocument();
  });
});

describe('adopt-a-control — pro-rata surcharge refund', () => {
  it('adopting a switched-off control opens its interval and shows the refund in both currencies', async () => {
    enroll();
    useStore.getState().setTier2(AGENT_ID, 'timelock', false);
    renderPolicies();

    fireEvent.click(screen.getByTestId('adopt-control'));
    await waitFor(() =>
      expect(screen.getByTestId('adopt-refund')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('adopt-refund').textContent).toMatch(
      /not from installation/i,
    );

    const agent = useStore.getState().agents.find((a) => a.id === AGENT_ID)!;
    expect(agent.controls.tier2.timelock).toBe(true);
    expect(agent.controlsHistory.timelock.at(-1)?.to).toBeUndefined();
    const enrollment = useStore.getState().enrollments[0];
    expect(enrollment.credits.at(-1)?.type).toBe('adopt-control');
  });
});
