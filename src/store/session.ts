/**
 * Session slice: operator, agents, mandates, enrollments, fleet, book,
 * interval histories (plan §2). Transitions write interval boundaries,
 * never overwrite booleans (plan §5b).
 */
import type { StateCreator } from 'zustand';
import { createSeedState } from '../data/seed';
import { DAY_MS, YEAR_MS } from '../lib/clocks';
import { demoNow } from '../lib/demoClock';
import type {
  Agent,
  Interval,
  RootState,
  SessionSlice,
  Tier1Gate,
} from './types';

function closeOpenInterval<T extends Interval>(intervals: T[], at: number): T[] {
  return intervals.map((iv) =>
    iv.to === undefined ? ({ ...iv, to: at } as T) : iv,
  );
}

function updateAgent(
  agents: Agent[],
  agentId: string,
  fn: (a: Agent) => Agent,
): Agent[] {
  return agents.map((a) => (a.id === agentId ? fn(a) : a));
}

export const createSessionSlice: StateCreator<RootState, [], [], SessionSlice> = (
  set,
) => {
  const seed = createSeedState();
  return {
    operator: seed.operator,
    agents: seed.agents,
    mandates: seed.mandates,
    pendingEdits: seed.pendingEdits,
    enrollments: seed.enrollments,
    book: seed.book,
    nearMisses: seed.nearMisses,

    // -- identity / verification --------------------------------------------
    renameOperator: (name) =>
      set((s) => ({ operator: { ...s.operator, name } })),

    verifyOperator: (at = demoNow()) =>
      set((s) => ({
        operator: {
          ...s.operator,
          verificationHistory: [
            ...closeOpenInterval(s.operator.verificationHistory, at),
            { from: at, verified: true },
          ],
        },
      })),

    revokeVerification: (at = demoNow()) =>
      set((s) => ({
        operator: {
          ...s.operator,
          verificationHistory: closeOpenInterval(
            s.operator.verificationHistory,
            at,
          ),
        },
      })),

    // -- agents ---------------------------------------------------------------
    registerAgent: (agent) => {
      set((s) => ({ agents: [...s.agents.filter((a) => a.id !== agent.id), agent] }));
      return agent.id;
    },

    markOwnershipVerified: (agentId) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          ownershipVerified: true,
        })),
      })),

    setAgentStatus: (agentId, status) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({ ...a, status })),
      })),

    setTier1: (agentId, gate, on) => {
      const at = demoNow();
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          controls: { ...a.controls, tier1: { ...a.controls.tier1, [gate]: on } },
          gateHistory: {
            ...a.gateHistory,
            [gate]: on
              ? [...a.gateHistory[gate], { from: at }]
              : closeOpenInterval(a.gateHistory[gate], at),
          },
        })),
      }));
    },

    setTier2: (agentId, control, on) => {
      const at = demoNow();
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          controls: {
            ...a.controls,
            tier2: { ...a.controls.tier2, [control]: on },
          },
          controlsHistory: {
            ...a.controlsHistory,
            [control]: on
              ? [...a.controlsHistory[control], { from: at }]
              : closeOpenInterval(a.controlsHistory[control], at),
          },
        })),
      }));
    },

    tripGate: (agentId, gate: Tier1Gate, at = demoNow()) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          controls: { ...a.controls, tier1: { ...a.controls.tier1, [gate]: false } },
          gateHistory: {
            ...a.gateHistory,
            [gate]: closeOpenInterval(a.gateHistory[gate], at),
          },
        })),
      })),

    cureGate: (agentId, gate: Tier1Gate, at = demoNow()) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          controls: { ...a.controls, tier1: { ...a.controls.tier1, [gate]: true } },
          gateHistory: {
            ...a.gateHistory,
            [gate]: [...a.gateHistory[gate], { from: at }],
          },
        })),
      })),

    suspendAgent: (agentId, reason, at = demoNow()) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          status: 'Suspended',
          suspensionHistory: [...a.suspensionHistory, { from: at, reason }],
        })),
      })),

    unsuspendAgent: (agentId, at = demoNow(), reason?: string) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => {
          // Cause-specific cure: close only the matching-reason suspension
          // intervals (all open ones when no reason is given), and derive
          // Active only when NO open trigger remains — curing one cause must
          // never mask another still-open suspension (REQ-7.9.1).
          const suspensionHistory = a.suspensionHistory.map((iv) =>
            iv.to === undefined && (reason === undefined || iv.reason === reason)
              ? { ...iv, to: at }
              : iv,
          );
          const stillSuspended = suspensionHistory.some((iv) => iv.to === undefined);
          return {
            ...a,
            status: stillSuspended ? a.status : 'Active',
            suspensionHistory,
          };
        }),
      })),

    deEnrollAgent: (agentId, at = demoNow()) =>
      set((s) => ({
        agents: updateAgent(s.agents, agentId, (a) => ({
          ...a,
          status: 'De-enrolled',
        })),
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId && e.terminatedAt === undefined
            ? { ...e, terminatedAt: at }
            : e,
        ),
      })),

    // -- mandates -------------------------------------------------------------
    saveMandate: (agentId, mandate) =>
      set((s) => {
        const versions = s.mandates[agentId] ?? [];
        const idx = versions.findIndex((m) => m.version === mandate.version);
        const next =
          idx >= 0
            ? versions.map((m, i) => (i === idx ? mandate : m))
            : [...versions, mandate];
        return { mandates: { ...s.mandates, [agentId]: next } };
      }),

    countersignMandate: (agentId, at = demoNow(), by = 'Aria Chen') =>
      set((s) => {
        const versions = s.mandates[agentId] ?? [];
        if (versions.length === 0) return {};
        const next = versions.map((m, i) =>
          i === versions.length - 1 ? { ...m, countersigned: { by, at } } : m,
        );
        return { mandates: { ...s.mandates, [agentId]: next } };
      }),

    setPendingEdit: (agentId, edit) =>
      set((s) => ({ pendingEdits: { ...s.pendingEdits, [agentId]: edit } })),

    clearPendingEdit: (agentId) =>
      set((s) => {
        const next = { ...s.pendingEdits };
        delete next[agentId];
        return { pendingEdits: next };
      }),

    commitMandateEdit: (agentId, at = demoNow()) =>
      set((s) => {
        const edit = s.pendingEdits[agentId];
        const versions = s.mandates[agentId] ?? [];
        if (!edit || versions.length === 0) return {};
        const closed = versions.map((m, i) =>
          i === versions.length - 1 && m.inForceTo === undefined
            ? { ...m, inForceTo: at }
            : m,
        );
        const nextEdits = { ...s.pendingEdits };
        delete nextEdits[agentId];
        return {
          mandates: {
            ...s.mandates,
            [agentId]: [...closed, { ...edit.draft, inForceFrom: at }],
          },
          pendingEdits: nextEdits,
        };
      }),

    // -- enrollments / payments ----------------------------------------------
    addEnrollment: (enrollment) =>
      set((s) => ({ enrollments: [...s.enrollments, enrollment] })),

    updateEnrollment: (agentId, patch) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId && e.terminatedAt === undefined
            ? { ...e, ...patch }
            : e,
        ),
      })),

    appendPaymentItem: (agentId, item) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId
            ? { ...e, paymentHistory: [...e.paymentHistory, item] }
            : e,
        ),
      })),

    markInstallmentOverdue: (agentId, at = demoNow()) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId
            ? {
                ...e,
                paymentHistory: [
                  ...e.paymentHistory,
                  {
                    kind: 'installment' as const,
                    // Due >15 days before "now": already suspends cover.
                    dueAt: at - 16 * DAY_MS,
                    amountUsd: e.premiumUsd / 4,
                    amountN: e.premiumUsd / 4 / e.conversionRateAtPayment,
                    rateUsed: e.conversionRateAtPayment,
                  },
                ],
              }
            : e,
        ),
      })),

    payOverdueInstallments: (agentId, at = demoNow()) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId
            ? {
                ...e,
                // Settle only items already due — future scheduled quarterly
                // installments stay open until their own dueAt.
                paymentHistory: e.paymentHistory.map((item) =>
                  item.paidAt === undefined && item.dueAt <= at
                    ? { ...item, paidAt: at }
                    : item,
                ),
              }
            : e,
        ),
      })),

    setPaymentPlan: (agentIds, plan) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          agentIds.includes(e.agentId) && e.terminatedAt === undefined
            ? { ...e, paymentPlan: plan }
            : e,
        ),
      })),

    activateEnrollments: (receipt) => {
      const at = receipt.paidAt;
      const agentIds = receipt.targets.agentIds ?? [];
      set((s) => ({
        agents: s.agents.map((a) =>
          agentIds.includes(a.id) ? { ...a, status: 'Active' as const } : a,
        ),
        enrollments: s.enrollments.map((e) => {
          // Idempotent: an enrollment already activated by a previous initial
          // payment is never re-anchored (its effectiveAt/renewalAt stand).
          if (!agentIds.includes(e.agentId) || e.effectiveAt !== 0) return e;
          // Quarterly plan: the first installment was charged today (recorded
          // by the payment port); the remaining three become due items with
          // future dueAt so the >15-days-overdue rule works on them naturally.
          const futureInstallments =
            e.paymentPlan === 'quarterly'
              ? [1, 2, 3].map((q) => ({
                  kind: 'installment' as const,
                  dueAt: at + Math.round((q * YEAR_MS) / 4),
                  amountUsd: e.premiumUsd / 4,
                  amountN: e.premiumUsd / 4 / receipt.rateUsed,
                  rateUsed: receipt.rateUsed,
                }))
              : [];
          return {
            ...e,
            effectiveAt: at,
            renewalAt: at + YEAR_MS,
            conversionRateAtPayment: receipt.rateUsed,
            // Fix: settledN comes from the rate ACTUALLY paid at (the
            // receipt), not the quote-time feed value.
            settledN: e.premiumUsd / receipt.rateUsed,
            paymentHistory: [...e.paymentHistory, ...futureInstallments],
          };
        }),
        mandates: Object.fromEntries(
          Object.entries(s.mandates).map(([agentId, versions]) => [
            agentId,
            agentIds.includes(agentId)
              ? versions.map((m, i) =>
                  i === versions.length - 1 && m.inForceFrom === undefined
                    ? { ...m, inForceFrom: at }
                    : m,
                )
              : versions,
          ]),
        ),
      }));
    },

    addCredit: (agentId, credit) =>
      set((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.agentId === agentId ? { ...e, credits: [...e.credits, credit] } : e,
        ),
      })),

    // -- book / near-misses -----------------------------------------------
    commitBookEnrollment: (component, capUsd) =>
      set((s) => ({
        book: {
          ...s.book,
          enrolledCapsUsd: {
            ...s.book.enrolledCapsUsd,
            [component]: (s.book.enrolledCapsUsd[component] ?? 0) + capUsd,
          },
        },
      })),

    setBookComponentCaps: (harness, externalCapsUsd) =>
      set((s) => ({
        book: {
          ...s.book,
          components: s.book.components.map((c) =>
            c.harness === harness ? { ...c, externalCapsUsd } : c,
          ),
        },
      })),

    addNearMiss: (nearMiss) =>
      set((s) => ({ nearMisses: [...s.nearMisses, nearMiss] })),

    // -- wallet ---------------------------------------------------------------
    debitWallet: (amountN) =>
      set((s) => ({
        operator: {
          ...s.operator,
          walletBalance: s.operator.walletBalance - amountN,
        },
      })),
  };
};
