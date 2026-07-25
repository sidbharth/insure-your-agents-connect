/**
 * Centralized payment preflight / execute helper (plan §7a, finding 7) — WP-1.
 *
 * This is the ONLY code path that moves value. executePayment:
 *   1. await priceFeed.refetchNow()   (REQ-6.2 — before ANY payment action)
 *   2. record: append paymentHistory item {dueAt, paidAt: now, amountUsd,
 *      amountN, rateUsed}
 *   3. return receipt {rateUsed, paidAt, amountN}
 * Activation is a SEPARATE store transition after recording
 * (session.activateEnrollments(receipt)).
 *
 * The store side-effects are injected through `registerPaymentPorts` (the
 * store assembly wires the real adapter; tests wire fakes), keeping this
 * module free of store imports while honoring the frozen signature.
 */
import type { Timestamp } from '../store/types';

export type PaymentScope = 'initial-premium' | 'delta' | 'claim-settlement';

export interface NamedBlocker {
  /** Stable key, e.g. 'mandate-not-countersigned'. */
  key: string;
  /** Named-reason blocking copy (REQ-7.8.1, AC-7). */
  reason: string;
}

export type PreflightResult = { ok: true } | { ok: false; blockers: NamedBlocker[] };

/** The minimal session view preflight needs (kept narrow for purity/tests). */
export interface PaymentSessionView {
  agents: Array<{
    id: string;
    configHash: string;
    ownershipVerified: boolean;
    tier1AllOn: boolean;
    mandateCountersigned: boolean;
  }>;
  paymentMethodSelected: boolean;
}

/**
 * Pure preflight; drives the Pay button's disabled state. Initial-premium
 * scope checks: hash registered + ownership verified, mandate countersigned,
 * all tier-1 gates on, payment method selected — each failure produces a
 * NAMED blocker (REQ-7.8.1, AC-7). Delta and claim-settlement scopes only
 * require a payment method (their legs were established at enrollment).
 */
export function paymentPreflight(
  session: PaymentSessionView,
  scope: PaymentScope,
): PreflightResult {
  const blockers: NamedBlocker[] = [];

  if (scope === 'initial-premium') {
    for (const agent of session.agents) {
      if (!agent.configHash) {
        blockers.push({
          key: `hash-not-registered:${agent.id}`,
          reason: `${agent.id}: configuration hash not registered — the policy insures the fingerprinted agent`,
        });
      }
      if (!agent.ownershipVerified) {
        blockers.push({
          key: `ownership-not-verified:${agent.id}`,
          reason: `${agent.id}: ownership challenge not completed — control of the agent is unproven`,
        });
      }
      if (!agent.mandateCountersigned) {
        blockers.push({
          key: `mandate-not-countersigned:${agent.id}`,
          reason: `${agent.id}: no countersignature, no cover (framework T3.2)`,
        });
      }
      if (!agent.tier1AllOn) {
        blockers.push({
          key: `tier1-gate-off:${agent.id}`,
          reason: `${agent.id}: a tier-1 gate is off — not insurable at any price (GT-1)`,
        });
      }
    }
  }

  if (!session.paymentMethodSelected) {
    blockers.push({
      key: 'payment-method-not-selected',
      reason: 'No payment method selected',
    });
  }

  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}

export type PaymentKind = 'initial' | 'delta' | 'claim-settlement';

export interface PaymentTargets {
  /** Agents (initial/delta) or claim (settlement) the payment applies to. */
  agentIds?: string[];
  claimId?: string;
}

export interface PaymentReceipt {
  kind: PaymentKind;
  rateUsed: number;
  paidAt: Timestamp;
  amountUsd: number;
  amountN: number;
  targets: PaymentTargets;
}

/**
 * Store side-effects executePayment orchestrates, injected by the store
 * assembly (`store/index.ts`) — or by tests.
 */
export interface PaymentPorts {
  /** priceFeed.refetchNow — awaited before ANY payment (REQ-6.2). */
  refetchNow: () => Promise<void>;
  /** Effective USD-per-N rate AFTER the refetch (pin-aware). */
  getUsdPerN: () => number;
  /** Virtual demo-clock now. */
  now: () => Timestamp;
  /**
   * Record the payment: append paymentHistory item(s)
   * {dueAt, paidAt, amountUsd, amountN, rateUsed}. Never activates anything.
   */
  recordPayment: (receipt: PaymentReceipt) => void;
}

let ports: PaymentPorts | undefined;

/** Wire the store adapter (store assembly) or a fake (tests). */
export function registerPaymentPorts(p: PaymentPorts): void {
  ports = p;
}

/** Thrown when a payment is abandoned before any money moves (e.g. reset). */
export class PaymentAbortedError extends Error {
  constructor(reason: string) {
    super(`payment aborted: ${reason}`);
    this.name = 'PaymentAbortedError';
  }
}

export interface PaymentOptions {
  /**
   * Checked after the refetch, before anything is recorded: return true to
   * abandon the payment (throws PaymentAbortedError). Used by the reset
   * generation token so an in-flight payment never debits a fresh seed.
   */
  stale?: () => boolean;
}

/**
 * Execute a payment: re-fetch the price first, record the payment history
 * item, return the receipt. Never activates anything itself — activation is
 * a separate store transition (`session.activateEnrollments(receipt)`).
 *
 * `amountUsd` may be a function of the post-refetch rate — claim settlements
 * use this because retention (max(500 N × rate, 2% × loss)) makes the dollar
 * amount itself rate-dependent, and the amount transferred must be the one
 * computed AFTER the refetch.
 */
export async function executePayment(
  kind: PaymentKind,
  amountUsd: number | ((rateUsed: number) => number),
  targets: PaymentTargets,
  opts: PaymentOptions = {},
): Promise<PaymentReceipt> {
  if (ports === undefined) {
    throw new Error('payments: registerPaymentPorts() has not been called');
  }
  // 1. Re-fetch the price before ANY payment action (REQ-6.2).
  await ports.refetchNow();
  if (opts.stale?.()) {
    throw new PaymentAbortedError('state was reset while the payment was in flight');
  }

  // 2. Convert at the post-refetch rate and record.
  const rateUsed = ports.getUsdPerN();
  const paidAt = ports.now();
  const resolvedUsd =
    typeof amountUsd === 'function' ? amountUsd(rateUsed) : amountUsd;
  const receipt: PaymentReceipt = {
    kind,
    rateUsed,
    paidAt,
    amountUsd: resolvedUsd,
    amountN: resolvedUsd / rateUsed,
    targets,
  };
  ports.recordPayment(receipt);

  // 3. Return the receipt; the caller drives any activation transition.
  return receipt;
}
