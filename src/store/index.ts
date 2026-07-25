/**
 * Zustand store assembly + reset() (plan §2/§6, WP-0 owned).
 *
 * reset() restores the EXACT seed state — including the seeded price setting
 * `pinned: false` (unpinned, live feed, seed fallback $3.00). A presenter pin
 * set during the session never survives reset (finding 5, AC-16). A fresh
 * price fetch resumes after reset.
 */
import { create } from 'zustand';
import { resetIncidentCounter } from '../data/incidents';
import { createSeedState } from '../data/seed';
import { clearSavedSession } from '../lib/sessionSave';
import { demoNow, registerOffsetProvider } from '../lib/demoClock';
import { registerPaymentPorts } from '../lib/payments';
import { resetWizardAgentId } from '../screens/wizard/wizardAgent';
import { resetClaimCounter, createClaimsSlice } from './claims';
import { createPresenterSlice } from './presenter';
import { createPriceFeedSlice, startPriceFeed } from './priceFeed';
import { createSessionSlice } from './session';
import type { RootState, UiSlice } from './types';
import type { StateCreator } from 'zustand';

const createUiSlice: StateCreator<RootState, [], [], UiSlice> = (set) => ({
  showMath: false,
  setShowMath: (on) => set({ showMath: on }),
  role: null,
  setRole: (role) => set({ role }),
});

export const useStore = create<RootState>()((set, get, api) => ({
  ...createPriceFeedSlice(set, get, api),
  ...createSessionSlice(set, get, api),
  ...createClaimsSlice(set, get, api),
  ...createPresenterSlice(set, get, api),
  ...createUiSlice(set, get, api),

  resetGeneration: 0,

  reset: () => {
    clearSavedSession(); // a reset invalidates any saved snapshot too
    resetClaimCounter();
    resetIncidentCounter(); // presenter incident ids restart with the world (AC-16)
    resetWizardAgentId(); // wizard-local module state resets with the world (AC-16)
    const seed = createSeedState();
    set({
      // Bump the generation token FIRST-class with the seed swap: any async
      // workflow that captured the old value abandons its side effects.
      resetGeneration: get().resetGeneration + 1,
      operator: seed.operator,
      agents: seed.agents,
      mandates: seed.mandates,
      pendingEdits: seed.pendingEdits,
      enrollments: seed.enrollments,
      book: seed.book,
      nearMisses: seed.nearMisses,
      incidents: seed.incidents,
      claims: seed.claims,
      priceFeed: seed.priceFeed, // pinned: false — the seeded setting (AC-16)
      presenter: seed.presenter, // panel closed, disarmed, time offset 0
      showMath: seed.showMath,
      role: null,
    });
    // A fresh fetch resumes after reset (plan §6).
    void get().refetchNow();
  },
}));

// Wire the virtual demo clock to the presenter time offset (plan §1).
registerOffsetProvider(() => useStore.getState().presenter.timeOffsetMs);

// Wire lib/payments.ts to the store (plan §7a): refetch-first, record, and
// leave activation to a separate session transition. Tests may re-register
// fake ports; App start re-registers the real adapter via this module import.
registerPaymentPorts({
  refetchNow: () => useStore.getState().refetchNow(),
  getUsdPerN: () => useStore.getState().priceFeed.usdPerN,
  now: () => demoNow(),
  recordPayment: (receipt) => {
    const state = useStore.getState();
    if (receipt.kind === 'claim-settlement') {
      // Settlement pays the insured: credit the demo wallet in N.
      state.debitWallet(-receipt.amountN);
      return;
    }
    // initial / delta: record one payment-history item per target agent and
    // debit the demo wallet only for what was actually recorded. Initial
    // payments are IDEMPOTENT per enrollment: an already-activated enrollment
    // (effectiveAt stamped) is skipped, so a repeated initial payment can
    // never double-charge an Active agent. A quarterly plan charges one
    // quarter of the premium today (the other three are future installments
    // created by activateEnrollments).
    const agentIds = receipt.targets.agentIds ?? [];
    let debitedN = 0;
    for (const agentId of agentIds) {
      const enrollment = state.enrollments.find(
        (e) => e.agentId === agentId && e.terminatedAt === undefined,
      );
      if (receipt.kind === 'initial') {
        if (enrollment === undefined || enrollment.effectiveAt !== 0) continue;
      }
      const amountUsd =
        receipt.kind === 'initial' && enrollment !== undefined
          ? enrollment.paymentPlan === 'quarterly'
            ? enrollment.premiumUsd / 4
            : enrollment.premiumUsd
          : receipt.amountUsd / Math.max(1, agentIds.length);
      state.appendPaymentItem(agentId, {
        kind: receipt.kind,
        dueAt: receipt.paidAt,
        paidAt: receipt.paidAt,
        amountUsd,
        amountN: amountUsd / receipt.rateUsed,
        rateUsed: receipt.rateUsed,
      });
      debitedN += amountUsd / receipt.rateUsed;
    }
    state.debitWallet(debitedN);
  },
});

/** App entry calls this once: initial fetch + 60 s refresh loop. */
export function initPriceFeed(): void {
  startPriceFeed(useStore);
}

export type { RootState } from './types';
