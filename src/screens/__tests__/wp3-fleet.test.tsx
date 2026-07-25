/**
 * WP-3 — Screen 7.7 "Add additional agents" (REQ-7.7.1–4, AC-5, AC-6).
 * Fleet totals are the EXACT sum of per-agent premiums ($4,150 ≈ 1,383 N
 * after the full import); the concentration loading is decided atomically on
 * the prospective book — Vendor-Bot at exactly 40.0000% carries NO tag,
 * Settle-Bot crosses and every later Helios enrollment is tagged; frozen
 * tags survive a later book drop while new enrollments lapse; Legacy-Bot
 * shows 1.2% + Coverage B excluded; de-enroll per D7.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Fleet from '../Fleet';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { setLatencyTestMode } from '../../lib/latency';
import { demoNow } from '../../lib/demoClock';
import { FLEET_IMPORT_ORDER, HELIOS, SEED_EPOCH, WIZARD_AGENT } from '../../data/seed';
import { currentShare } from '../../lib/concentration';
import type { Incident } from '../../store/types';
import {
  enrollAgent,
  fleetTotals,
  hasConcentrationLoading,
  prepareImportedAgent,
} from '../purchase/enroll';

function renderFleet() {
  return render(
    <MemoryRouter initialEntries={['/fleet']}>
      <Fleet />
    </MemoryRouter>,
  );
}

/** Enroll the wizard agent + the 11 seeded agents in the fixed order. */
function enrollWholeFleet(): void {
  for (const spec of [WIZARD_AGENT, ...FLEET_IMPORT_ORDER]) {
    prepareImportedAgent(spec.id);
    enrollAgent(spec.id);
  }
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

describe('7.7 — totals are the exact sum (REQ-7.7.1, AC-5)', () => {
  it('starts at the wizard agent only: $300', async () => {
    renderFleet();
    await waitFor(() =>
      expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$300'),
    );
    expect(screen.getByTestId('fleet-total-n')).toHaveTextContent('≈ 100 $NEAR');
  });

  it("auto-enrolls a 'Quoted' wizard agent (post-connect status) on arrival", async () => {
    // The 7.3 connect flow leaves the wizard agent 'Quoted', not 'Draft' —
    // Fleet must still enroll it so its row + the $300 total exist (AC-5).
    useStore.getState().setAgentStatus(WIZARD_AGENT.id, 'Quoted');
    renderFleet();
    await waitFor(() =>
      expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$300'),
    );
    expect(
      useStore
        .getState()
        .enrollments.some(
          (e) => e.agentId === WIZARD_AGENT.id && e.terminatedAt === undefined,
        ),
    ).toBe(true);
  });

  it('mid-import the total is still the exact running sum', () => {
    prepareImportedAgent(WIZARD_AGENT.id);
    enrollAgent(WIZARD_AGENT.id);
    // first three imports: Legacy $600, Relay $300, Payables $300
    for (const spec of FLEET_IMPORT_ORDER.slice(0, 3)) {
      prepareImportedAgent(spec.id);
      enrollAgent(spec.id);
    }
    renderFleet();
    expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$1,500');
    expect(fleetTotals(useStore.getState()).premiumUsd).toBe(300 + 600 + 300 + 300);
  });

  it('after the full import the roll-up is $4,150 ≈ 1,383 N — no volume discount', () => {
    enrollWholeFleet();
    renderFleet();
    // 6 × $300 + 5 × $350 + 1 × $600 = $4,150
    expect(fleetTotals(useStore.getState()).premiumUsd).toBe(4_150);
    expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$4,150');
    expect(screen.getByTestId('fleet-total-n')).toHaveTextContent('≈ 1,383 $NEAR');
  });

  it('de-enrolling an agent drops the total by exactly its premium', () => {
    enrollWholeFleet();
    renderFleet();
    fireEvent.click(screen.getByTestId('row-menu-legacy-bot'));
    fireEvent.click(screen.getByTestId('deenroll-confirm-legacy-bot'));
    // $4,150 − $600 (Legacy-Bot at 1.2%)
    expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$3,550');
    expect(fleetTotals(useStore.getState()).premiumUsd).toBe(3_550);
  });
});

describe('7.7 — concentration loading (REQ-7.7.2, AC-6)', () => {
  it('Vendor-Bot lands at exactly 40.0000% and carries NO tag; Settle-Bot crosses', () => {
    enrollWholeFleet();
    const s = useStore.getState();
    const byId = (id: string) => s.enrollments.find((e) => e.agentId === id)!;

    // exact-boundary rule: > 0.40 strictly, so Vendor-Bot is untagged
    expect(hasConcentrationLoading(byId('vendor-bot'))).toBe(false);
    // Settle-Bot crosses; every later Helios enrollment carries the loading
    for (const id of ['settle-bot', 'invoice-bot', 'renewals-bot', 'deposits-bot', 'clearing-bot']) {
      expect(hasConcentrationLoading(byId(id))).toBe(true);
    }
    // earlier enrollments stay clean
    for (const id of [WIZARD_AGENT.id, 'legacy-bot', 'relay-bot', 'payables-bot', 'refunds-bot', 'treasury-bot', 'vendor-bot']) {
      expect(hasConcentrationLoading(byId(id))).toBe(false);
    }

    renderFleet();
    const settleRow = screen.getByTestId('fleet-row-settle-bot');
    expect(within(settleRow).getByTestId('concentration-tag')).toHaveTextContent(
      '+0.1% concentration',
    );
    expect(within(settleRow).getByText('0.7%')).toBeInTheDocument();
    const vendorRow = screen.getByTestId('fleet-row-vendor-bot');
    expect(within(vendorRow).queryByTestId('concentration-tag')).not.toBeInTheDocument();
    expect(within(vendorRow).getByText('0.6%')).toBeInTheDocument();
  });

  it('frozen tags persist after the presenter drops the book; later enrollments lapse', () => {
    // enroll everything except the last agent, so Clearing-Bot enrolls after the drop
    for (const spec of [WIZARD_AGENT, ...FLEET_IMPORT_ORDER.slice(0, 10)]) {
      prepareImportedAgent(spec.id);
      enrollAgent(spec.id);
    }
    const before = useStore.getState();
    expect(hasConcentrationLoading(before.enrollments.find((e) => e.agentId === 'settle-bot')!)).toBe(true);

    // presenter drops the fictional Helios external caps → share falls below 40%
    useStore.getState().setBookComponentCaps(HELIOS, 500_000);
    expect(currentShare(useStore.getState().book, HELIOS)).toBeLessThan(0.4);

    // frozen: Settle-Bot keeps its +0.1% (rates never change retroactively, 5.8.2)
    const after = useStore.getState();
    expect(hasConcentrationLoading(after.enrollments.find((e) => e.agentId === 'settle-bot')!)).toBe(true);

    // a NEW enrollment decided after the drop carries no loading
    prepareImportedAgent('clearing-bot');
    enrollAgent('clearing-bot');
    const clearing = useStore.getState().enrollments.find((e) => e.agentId === 'clearing-bot')!;
    expect(hasConcentrationLoading(clearing)).toBe(false);
    expect(clearing.premiumUsd).toBe(300); // 0.6% × $50,000, not 0.7%
  });

  it('the CSV import sweep runs the theater per agent and records the crossing', async () => {
    renderFleet();
    await waitFor(() =>
      expect(useStore.getState().agents.find((a) => a.id === WIZARD_AGENT.id)?.status).toBe(
        'Quoted',
      ),
    );
    fireEvent.click(screen.getByTestId('import-fleet-csv-button'));
    // latency test mode → each theater completes instantly; drive all 11
    await waitFor(
      () => expect(useStore.getState().enrollments.length).toBe(12),
      { timeout: 5_000 },
    );
    const settleRow = screen.getByTestId('fleet-row-settle-bot');
    expect(within(settleRow).getByTestId('concentration-tag')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-total-premium')).toHaveTextContent('$4,150');
  });
});

describe('7.7 — Legacy-Bot line (REQ-7.7.3)', () => {
  it('shows 1.2%, $600 and the Coverage B excluded chip', () => {
    enrollWholeFleet();
    renderFleet();
    const row = screen.getByTestId('fleet-row-legacy-bot');
    expect(within(row).getByText('1.2%')).toBeInTheDocument();
    expect(within(row).getByText(/\$600/)).toBeInTheDocument();
    expect(within(row).getByTestId('coverage-b-chip')).toHaveTextContent('Coverage B excluded');
  });
});

describe('7.7 — de-enroll menu (REQ-7.7.4, D7)', () => {
  it('offers the pro-rata refund with "past events remain claimable" copy', () => {
    enrollWholeFleet();
    renderFleet();
    fireEvent.click(screen.getByTestId('row-menu-relay-bot'));
    const menu = screen.getByTestId('deenroll-menu-relay-bot');
    expect(menu).toHaveTextContent(/past events remain claimable/i);
    expect(within(menu).getByTestId('deenroll-refund')).toHaveTextContent(/pro rata/);
    // enrolled just now → refund ≈ full premium $300
    expect(within(menu).getByTestId('deenroll-refund')).toHaveTextContent('$300');
  });

  it('confirming de-enrolls: status flips and the enrollment is terminated', () => {
    enrollWholeFleet();
    renderFleet();
    fireEvent.click(screen.getByTestId('row-menu-relay-bot'));
    fireEvent.click(screen.getByTestId('deenroll-confirm-relay-bot'));
    const s = useStore.getState();
    expect(s.agents.find((a) => a.id === 'relay-bot')?.status).toBe('De-enrolled');
    expect(s.enrollments.find((e) => e.agentId === 'relay-bot')?.terminatedAt).toBeDefined();
  });

  it('refund is $0 with the named reason once an incident is noticed (D7 exception)', () => {
    enrollWholeFleet();
    const incident: Incident = {
      id: 'inc-wp3-1',
      scenarioId: 'S-09',
      agentId: 'payables-bot',
      narrative: 'noticed loss on Payables-Bot',
      discoveredAt: demoNow(),
      eventAt: SEED_EPOCH,
      lossGrossUsd: 20_000,
      lossTxRefs: ['0xabc'],
      containment: { frozen: [], rotated: [] },
      artifacts: {},
    };
    act(() => useStore.getState().addIncident(incident));
    renderFleet();
    fireEvent.click(screen.getByTestId('row-menu-payables-bot'));
    const menu = screen.getByTestId('deenroll-menu-payables-bot');
    const blocked = within(menu).getByTestId('deenroll-no-refund');
    expect(blocked).toHaveTextContent(/No premium is returned/);
    expect(blocked).toHaveTextContent('claim paid or noticed');
    expect(within(menu).queryByTestId('deenroll-refund')).not.toBeInTheDocument();
  });
});
