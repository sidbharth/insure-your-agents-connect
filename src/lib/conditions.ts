/**
 * Event-time conditions-precedent evaluation over interval histories
 * (plan §5b, finding 2) — WP-1.
 *
 * All presenter/user actions write interval boundaries, never overwrite
 * booleans; current UI state = "interval open at demoClock.now()". Because
 * every condition is evaluated from its history at instant `t`, later cures
 * or breaks can never change the adjudication of an event at `t` (AC-13).
 */
import type {
  Agent,
  ConditionState,
  Enrollment,
  Interval,
  Mandate,
  Operator,
  Timestamp,
} from '../store/types';
import { TIER1_GATES } from '../store/types';

const DAY_MS = 24 * 3_600_000;

/** Premium-current window: no item due more than 15 days before t and unpaid at t. */
export const PREMIUM_OVERDUE_DAYS = 15;

/** True iff some interval in the list covers `t` ([from, to) semantics, open to = ∞). */
export function intervalCovers(intervals: Interval[], t: Timestamp): boolean {
  return intervals.some(
    (iv) => iv.from <= t && (iv.to === undefined || t < iv.to),
  );
}

// -- component evaluators (additive WP-1 exports; also used by claims.ts) ----

/** Some countersigned mandate version's [inForceFrom, inForceTo) covers t. */
export function mandateInForceAt(mandateVersions: Mandate[], t: Timestamp): boolean {
  return mandateVersions.some(
    (m) =>
      m.countersigned !== undefined &&
      m.inForceFrom !== undefined &&
      m.inForceFrom <= t &&
      (m.inForceTo === undefined || t < m.inForceTo),
  );
}

/** No payment item due more than 15 days before t and still unpaid at t. */
export function premiumCurrentAt(
  enrollment: Enrollment | undefined,
  t: Timestamp,
): boolean {
  if (enrollment === undefined) return false;
  return !enrollment.paymentHistory.some(
    (item) =>
      item.dueAt < t - PREMIUM_OVERDUE_DAYS * DAY_MS &&
      (item.paidAt === undefined || item.paidAt > t),
  );
}

/** An operator verified-interval covers t. */
export function verificationCurrentAt(
  history: Operator['verificationHistory'],
  t: Timestamp,
): boolean {
  return history.some(
    (iv) => iv.verified && iv.from <= t && (iv.to === undefined || t < iv.to),
  );
}

/** effectiveAt ≤ t < (terminatedAt ?? ∞). */
export function enrolledAt(
  enrollment: Enrollment | undefined,
  t: Timestamp,
): boolean {
  return (
    enrollment !== undefined &&
    enrollment.effectiveAt <= t &&
    (enrollment.terminatedAt === undefined || t < enrollment.terminatedAt)
  );
}

/**
 * Evaluate all six condition components at instant `t`:
 * - gatesOperative: every tier-1 gate has an open interval covering t
 * - mandateInForce: some countersigned version's [inForceFrom, inForceTo) covers t
 * - premiumCurrent: no payment item with dueAt < t−15d still unpaid at t
 * - verificationCurrent: operator verified-interval covers t
 * - suspended: a suspension interval covers t
 * - enrolled: effectiveAt ≤ t < (terminatedAt ?? ∞)
 */
export function conditionStateAt(
  t: Timestamp,
  agent: Agent,
  mandateVersions: Mandate[],
  enrollment: Enrollment | undefined,
  operator: Operator,
): ConditionState {
  const gatesOperative = TIER1_GATES.every((g) =>
    intervalCovers(agent.gateHistory[g], t),
  );
  const mandateInForce = mandateInForceAt(mandateVersions, t);
  const premiumCurrent = premiumCurrentAt(enrollment, t);
  const verificationCurrent = verificationCurrentAt(operator.verificationHistory, t);
  const suspended = intervalCovers(agent.suspensionHistory, t);
  const enrolled = enrolledAt(enrollment, t);

  return {
    gatesOperative,
    mandateInForce,
    premiumCurrent,
    verificationCurrent,
    suspended,
    enrolled,
  };
}

/**
 * Reduce a ConditionState to the pass/fail contract used by adjudication;
 * `failedCondition` names the first failing condition for the denial copy.
 * Check order mirrors GT-2: enrolled → gates → mandate → premium →
 * verification → not suspended.
 */
export function conditionsPrecedentAt(state: ConditionState): {
  pass: boolean;
  failedCondition?: string;
} {
  if (!state.enrolled) {
    return { pass: false, failedCondition: 'not enrolled at event time' };
  }
  if (!state.gatesOperative) {
    return { pass: false, failedCondition: 'tier-1 gates not operative at event time' };
  }
  if (!state.mandateInForce) {
    return { pass: false, failedCondition: 'mandate not in force at event time' };
  }
  if (!state.premiumCurrent) {
    return { pass: false, failedCondition: 'premium more than 15 days overdue at event time' };
  }
  if (!state.verificationCurrent) {
    return { pass: false, failedCondition: 'verification not current at event time' };
  }
  if (state.suspended) {
    return { pass: false, failedCondition: 'cover suspended at event time' };
  }
  return { pass: true };
}
