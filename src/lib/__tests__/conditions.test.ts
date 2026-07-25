/**
 * Conditions-precedent tests (plan §5b, AC-13): event-time invariance for
 * each of the four conditions, in both directions —
 * fail at t, cure after t → still not payable;
 * hold at t, break later → still payable.
 */
import { describe, expect, it } from 'vitest';
import { conditionsPrecedentAt, conditionStateAt, intervalCovers } from '../conditions';
import {
  DAY_MS,
  EPOCH,
  testAgent,
  testEnrollment,
  testMandate,
  testOperator,
} from './fixtures';
import type { Agent, Operator } from '../../store/types';

const T = EPOCH + 10 * DAY_MS; // the event instant under adjudication
const LATER = T + 5 * DAY_MS; // when the state changes again

function passAt(
  t: number,
  agent: Agent = testAgent(),
  mandates = [testMandate()],
  enrollment = testEnrollment(),
  operator: Operator = testOperator(),
) {
  return conditionsPrecedentAt(conditionStateAt(t, agent, mandates, enrollment, operator));
}

describe('intervalCovers — [from, to) semantics', () => {
  it('covers from (inclusive) up to to (exclusive); open to = ∞', () => {
    const ivs = [{ from: 10, to: 20 }];
    expect(intervalCovers(ivs, 9)).toBe(false);
    expect(intervalCovers(ivs, 10)).toBe(true);
    expect(intervalCovers(ivs, 19)).toBe(true);
    expect(intervalCovers(ivs, 20)).toBe(false);
    expect(intervalCovers([{ from: 10 }], 1e15)).toBe(true);
  });
});

describe('gatesOperative — event-time invariance', () => {
  it('gate tripped at event time, cured after → still not payable', () => {
    const agent = testAgent();
    // Trip actionLogging before T, cure at LATER.
    agent.gateHistory = {
      ...agent.gateHistory,
      actionLogging: [{ from: EPOCH, to: T - DAY_MS }, { from: LATER }],
    };
    const r = passAt(T, agent);
    expect(r.pass).toBe(false);
    expect(r.failedCondition).toMatch(/gates/);
    // The cure is real for later events…
    expect(passAt(LATER + 1, agent).pass).toBe(true);
    // …but re-adjudicating the event at T is unchanged.
    expect(passAt(T, agent).pass).toBe(false);
  });

  it('gate operative at event time, tripped later → still payable', () => {
    const agent = testAgent();
    agent.gateHistory = {
      ...agent.gateHistory,
      whitelist: [{ from: EPOCH, to: LATER }],
    };
    expect(passAt(T, agent).pass).toBe(true);
    expect(passAt(LATER, agent).pass).toBe(false); // the later break is real
    expect(passAt(T, agent).pass).toBe(true); // T unchanged
  });
});

describe('mandateInForce — event-time invariance', () => {
  it('no version in force at event time, new version in force after → still not payable', () => {
    const mandates = [testMandate({ inForceFrom: LATER })];
    const r = passAt(T, testAgent(), mandates);
    expect(r.pass).toBe(false);
    expect(r.failedCondition).toMatch(/mandate/);
    expect(passAt(LATER, testAgent(), mandates).pass).toBe(true);
    expect(passAt(T, testAgent(), mandates).pass).toBe(false);
  });

  it('in force at event time, superseded later → still payable', () => {
    const mandates = [
      testMandate({ inForceFrom: EPOCH, inForceTo: LATER }),
      testMandate({ version: '1.1', inForceFrom: LATER }),
    ];
    expect(passAt(T, testAgent(), mandates).pass).toBe(true);
  });

  it('an uncountersigned version never counts as in force', () => {
    const mandates = [testMandate({ countersigned: undefined })];
    expect(passAt(T, testAgent(), mandates).pass).toBe(false);
  });
});

describe('premiumCurrent — event-time invariance', () => {
  it('item due >15d before t and unpaid at t → not payable, even if paid later', () => {
    const enrollment = testEnrollment({
      paymentHistory: [
        { kind: 'initial', dueAt: EPOCH, paidAt: EPOCH, amountUsd: 75, amountN: 25, rateUsed: 3 },
        // Installment due 20 days before T, paid only at LATER.
        { kind: 'installment', dueAt: T - 20 * DAY_MS, paidAt: LATER, amountUsd: 75, amountN: 25, rateUsed: 3 },
      ],
    });
    const r = passAt(T, testAgent(), [testMandate()], enrollment);
    expect(r.pass).toBe(false);
    expect(r.failedCondition).toMatch(/premium/);
    // After the late payment, later events are payable again…
    expect(passAt(LATER + DAY_MS, testAgent(), [testMandate()], enrollment).pass).toBe(true);
    // …but T is unchanged.
    expect(passAt(T, testAgent(), [testMandate()], enrollment).pass).toBe(false);
  });

  it('item due <15d before t (even unpaid) → still current', () => {
    const enrollment = testEnrollment({
      paymentHistory: [
        { kind: 'initial', dueAt: EPOCH, paidAt: EPOCH, amountUsd: 75, amountN: 25, rateUsed: 3 },
        { kind: 'installment', dueAt: T - 10 * DAY_MS, amountUsd: 75, amountN: 25, rateUsed: 3 },
      ],
    });
    expect(passAt(T, testAgent(), [testMandate()], enrollment).pass).toBe(true);
    // 6 days later the same unpaid item is >15d overdue → not payable then.
    expect(passAt(T + 6 * DAY_MS, testAgent(), [testMandate()], enrollment).pass).toBe(false);
  });

  it('current at t, marked overdue later → the event at t stays payable', () => {
    const enrollment = testEnrollment({
      paymentHistory: [
        { kind: 'initial', dueAt: EPOCH, paidAt: EPOCH, amountUsd: 75, amountN: 25, rateUsed: 3 },
        // Presenter marks an installment overdue AFTER the event.
        { kind: 'installment', dueAt: LATER, amountUsd: 75, amountN: 25, rateUsed: 3 },
      ],
    });
    expect(passAt(T, testAgent(), [testMandate()], enrollment).pass).toBe(true);
  });
});

describe('verificationCurrent — event-time invariance (AC-13)', () => {
  it('revoked at event time, restored after → still not payable', () => {
    const operator = testOperator({
      verificationHistory: [
        { from: EPOCH, to: T - DAY_MS, verified: true },
        { from: LATER, verified: true },
      ],
    });
    const r = passAt(T, testAgent(), [testMandate()], testEnrollment(), operator);
    expect(r.pass).toBe(false);
    expect(r.failedCondition).toMatch(/verification/);
    // Restore is forward-looking only (AC-13): a new event after LATER proceeds.
    expect(passAt(LATER + 1, testAgent(), [testMandate()], testEnrollment(), operator).pass).toBe(true);
    // The old event stays not payable.
    expect(passAt(T, testAgent(), [testMandate()], testEnrollment(), operator).pass).toBe(false);
  });

  it('verified at event time, revoked later → still payable', () => {
    const operator = testOperator({
      verificationHistory: [{ from: EPOCH, to: LATER, verified: true }],
    });
    expect(passAt(T, testAgent(), [testMandate()], testEnrollment(), operator).pass).toBe(true);
    expect(passAt(LATER, testAgent(), [testMandate()], testEnrollment(), operator).pass).toBe(false);
    expect(passAt(T, testAgent(), [testMandate()], testEnrollment(), operator).pass).toBe(true);
  });
});

describe('suspension and enrollment windows', () => {
  it('suspended at t → not payable; unsuspended window unaffected', () => {
    const agent = testAgent({
      suspensionHistory: [{ from: T - DAY_MS, to: LATER, reason: 'hash mismatch' }],
    });
    expect(passAt(T, agent).pass).toBe(false);
    expect(passAt(LATER + 1, agent).pass).toBe(true);
    expect(passAt(T - 2 * DAY_MS, agent).pass).toBe(true);
  });

  it('enrolled: effectiveAt ≤ t < terminatedAt; past events stay claimable after de-enroll', () => {
    const enrollment = testEnrollment({ terminatedAt: LATER });
    // Event before termination → still payable even though the agent has left.
    expect(passAt(T, testAgent(), [testMandate()], enrollment).pass).toBe(true);
    // Event at/after termination → not payable.
    expect(passAt(LATER, testAgent(), [testMandate()], enrollment).pass).toBe(false);
    // Event before effectiveAt → not payable.
    expect(passAt(EPOCH - 1, testAgent(), [testMandate()], enrollment).pass).toBe(false);
  });
});
