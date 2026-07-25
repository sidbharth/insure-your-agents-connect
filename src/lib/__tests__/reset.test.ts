/**
 * reset() semantics (plan §6, AC-16):
 * from ANY mutated state — pinned or unpinned — reset() restores the exact
 * seed state, including the seeded price setting `pinned: false`, and a
 * fresh price fetch resumes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { createSeedState, SEED_EPOCH, SEED_CAP_USD, HELIOS } from '../../data/seed';
import type { Incident } from '../../store/types';

const testIncident: Incident = {
  id: 'inc-test-1',
  scenarioId: 'S-09',
  agentId: 'payables-bot',
  narrative: 'test incident',
  discoveredAt: SEED_EPOCH + 1_000,
  eventAt: SEED_EPOCH + 500,
  lossGrossUsd: 20_000,
  lossTxRefs: ['0xdeadbeef'],
  containment: { frozen: [], rotated: [] },
  artifacts: {},
};

/** Mutate the store broadly across every slice. */
function mutateEverything(): void {
  const s = useStore.getState();
  s.renameOperator('Mutated Corp');
  s.revokeVerification(SEED_EPOCH + 2_000);
  const firstAgent = useStore.getState().agents[0];
  s.markOwnershipVerified(firstAgent.id);
  s.setAgentStatus(firstAgent.id, 'Active');
  s.tripGate(firstAgent.id, 'transferCaps', SEED_EPOCH + 3_000);
  s.suspendAgent(firstAgent.id, 'test suspension', SEED_EPOCH + 3_500);
  s.commitBookEnrollment(HELIOS, SEED_CAP_USD);
  s.addIncident(testIncident);
  s.openClaim(testIncident.id);
  s.addNearMiss({
    id: 'nm-1',
    type: 'kill-switch',
    at: SEED_EPOCH + 4_000,
    creditTag: 'ks-drill',
    creditPoints: 0.01,
    description: 'test near miss',
  });
  s.debitWallet(500);
  s.advanceTime(7 * 24 * 3_600_000);
  s.setPanelOpen(true);
  s.setArmed(true);
  s.setShowMath(true);
}

/** Field-by-field comparison against a fresh seed (store holds functions too). */
function expectSeedState(): void {
  const seed = createSeedState();
  const state = useStore.getState();
  expect(state.operator).toEqual(seed.operator);
  expect(state.agents).toEqual(seed.agents);
  expect(state.mandates).toEqual(seed.mandates);
  expect(state.pendingEdits).toEqual(seed.pendingEdits);
  expect(state.enrollments).toEqual(seed.enrollments);
  expect(state.book).toEqual(seed.book);
  expect(state.nearMisses).toEqual(seed.nearMisses);
  expect(state.incidents).toEqual(seed.incidents);
  expect(state.claims).toEqual(seed.claims);
  expect(state.presenter).toEqual({ panelOpen: false, armed: false, timeOffsetMs: 0 });
  expect(state.showMath).toBe(false);
  // Seeded price SETTING restored: unpinned (AC-16). The live value may have
  // been refreshed by the post-reset fetch, but pinned is always false.
  expect(state.priceFeed.pinned).toBe(false);
  expect(state.priceFeed.pinnedValue).toBe(3.0);
}

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  useStore.getState().reset();
});

afterEach(() => {
  setPriceFetchFn(undefined);
});

describe('reset()', () => {
  it('restores the exact seed from a broadly mutated UNPINNED state', async () => {
    mutateEverything();
    // sanity: the mutations landed
    expect(useStore.getState().operator.name).toBe('Mutated Corp');
    expect(useStore.getState().claims).toHaveLength(1);
    expect(useStore.getState().presenter.timeOffsetMs).toBeGreaterThan(0);

    useStore.getState().reset();
    expectSeedState();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('restores pinned: false even when the presenter pinned the price (finding 5)', async () => {
    mutateEverything();
    useStore.getState().pinPrice();
    expect(useStore.getState().priceFeed.pinned).toBe(true);
    expect(useStore.getState().priceFeed.usdPerN).toBe(3.0);

    useStore.getState().reset();
    expectSeedState();
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().priceFeed.pinned).toBe(false);
  });

  it('a fresh fetch resumes after reset (live rate lands post-reset)', async () => {
    useStore.getState().pinPrice();
    setPriceFetchFn(async () => 3.21);
    useStore.getState().reset();
    await new Promise((r) => setTimeout(r, 0));
    const feed = useStore.getState().priceFeed;
    expect(feed.pinned).toBe(false);
    expect(feed.usdPerN).toBe(3.21);
    expect(feed.source).toBe('CoinGecko');
    expect(feed.stale).toBe(false);
  });

  it('claim ids restart from claim-1 after reset (deterministic, REQ-6.6)', () => {
    useStore.getState().addIncident(testIncident);
    const first = useStore.getState().openClaim(testIncident.id);
    expect(first).toBe('claim-1');
    useStore.getState().reset();
    useStore.getState().addIncident(testIncident);
    const again = useStore.getState().openClaim(testIncident.id);
    expect(again).toBe('claim-1');
  });
});
