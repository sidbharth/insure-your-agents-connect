/**
 * Claims slice: incidents, claims (plan §2). WP-0 provides the state shape
 * and the basic actions; WP-5 layers the presenter-driven incident builders
 * (data/incidents.ts) on top of these.
 */
import type { StateCreator } from 'zustand';
import { demoNow } from '../lib/demoClock';
import type { Claim, ClaimsSlice, RootState } from './types';

let claimCounter = 0;

export const createClaimsSlice: StateCreator<RootState, [], [], ClaimsSlice> = (
  set,
  get,
) => ({
  incidents: [],
  claims: [],

  addIncident: (incident) =>
    set((s) => ({ incidents: [...s.incidents, incident] })),

  openClaim: (incidentId) => {
    const incident = get().incidents.find((i) => i.id === incidentId);
    const id = `claim-${++claimCounter}`;
    const claim: Claim = {
      id,
      incidentId,
      conditionsPrecedent: { pass: true },
      evidence: [],
      clockState: {
        phase: 'Draft',
        anchors: { discoveredAt: incident?.discoveredAt ?? demoNow() },
      },
    };
    set((s) => ({ claims: [...s.claims, claim] }));
    return id;
  },

  updateClaim: (claimId, patch) =>
    set((s) => ({
      claims: s.claims.map((c) => (c.id === claimId ? { ...c, ...patch } : c)),
    })),

  setEvidenceStatus: (claimId, itemId, status) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              evidence: c.evidence.map((e) =>
                e.id === itemId ? { ...e, status } : e,
              ),
            }
          : c,
      ),
    })),

  setClockState: (claimId, clockState) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId ? { ...c, clockState } : c,
      ),
    })),

  setAdjudication: (claimId, result) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              adjudication: result,
              conditionsPrecedent: result.conditionsPrecedent,
            }
          : c,
      ),
    })),
});

/** Test/reset hook so claim ids stay deterministic from seed. */
export function bumpClaimCounterTo(n: number): void {
  claimCounter = Math.max(claimCounter, n);
}

export function resetClaimCounter(): void {
  claimCounter = 0;
}
