/**
 * Claims-pipeline tests (plan §5a, PRD §9 / Appendix B, AC-3c/9/10):
 * scripted scenario outcomes, per-event limit clips, the $0 floor, and the
 * recovery waterfall.
 */
import { describe, expect, it } from 'vitest';
import {
  adjudicate,
  applyPerEventLimit,
  perEventLimit,
  recoveryWaterfall,
  type AdjudicationInput,
} from '../claims';
import {
  attestationlessAgent,
  DAY_MS,
  EPOCH,
  eventStateFor,
  testAgent,
  testEnrollment,
  testIncident,
  testMandate,
  testOperator,
} from './fixtures';
import type { Agent, Incident } from '../../store/types';

const EVENT_AT = EPOCH + 9 * DAY_MS;

function inputFor(
  incident: Incident,
  agent: Agent = testAgent(),
  usdPerN = 3,
): AdjudicationInput {
  return {
    incident,
    agentStateAtEvent: eventStateFor(agent, incident.eventAt),
    mandateAtEvent: testMandate(),
    enrollment: testEnrollment({ agentId: agent.id }),
    operatorHistory: testOperator().verificationHistory,
    usdPerN,
  };
}

describe('S-03 cap-module failure (Coverage D)', () => {
  it('pays exactly the $10,000 excess of the $60,000 gross, retention waived', () => {
    const r = adjudicate(inputFor(testIncident('S-03')));
    expect(r.conditionsPrecedent.pass).toBe(true);
    expect(r.eligibility.covered).toBe(true);
    expect(r.eligibility.route).toBe('D');
    expect(r.math).toBeDefined();
    const m = r.math!;
    expect(m.grossLossUsd).toBe(60_000);
    expect(m.coveredQuantumUsd).toBe(10_000); // excess over the cap, not the gross
    expect(m.perEventLimitUsd).toBe(50_000); // D: 100% of cap
    expect(m.quantumAfterLimitUsd).toBe(10_000);
    expect(m.coinsuranceUsd).toBe(0); // all tier-2 on at event time
    expect(m.retentionWaived).toBe(true); // guardrail passed latest verification (5.3)
    expect(m.retentionUsd).toBe(0);
    expect(m.payoutUsd).toBe(10_000);
    expect(m.payoutN).toBeCloseTo(10_000 / 3, 10);
    // Full MathBreakdown with clause refs (5.3/5.5/5.6).
    expect(m.breakdown.clause).toBe('5.6');
    const clauses = (m.breakdown.lines ?? []).map((l) => l.clause);
    expect(clauses).toContain('5.3');
    expect(clauses).toContain('5.5');
  });

  it('without the verification pass, the retention applies', () => {
    const incident = testIncident('S-03', { guardrailPassedVerification: false });
    const m = adjudicate(inputFor(incident)).math!;
    expect(m.retentionWaived).toBe(false);
    // max(500 N × $3.00 = $1,500, 2% × $60,000 = $1,200) = $1,500.
    expect(m.retentionUsd).toBe(1_500);
    expect(m.payoutUsd).toBe(8_500);
  });
});

describe('S-09 prompt injection (Coverage B)', () => {
  it('pays $18,500 at $3.00 (= 20,000 − 0 coinsurance − 1,500 retention)', () => {
    const r = adjudicate(inputFor(testIncident('S-09'), testAgent(), 3));
    expect(r.eligibility.route).toBe('B');
    const m = r.math!;
    expect(m.coveredQuantumUsd).toBe(20_000);
    expect(m.coinsuranceUsd).toBe(0);
    // max(500 × $3.00 = $1,500, 2% × $20,000 = $400) = $1,500.
    expect(m.retentionUsd).toBe(1_500);
    expect(m.payoutUsd).toBe(18_500);
    expect(m.rateUsed).toBe(3);
    expect(m.payoutN).toBeCloseTo(18_500 / 3, 10);
  });

  it('against an attestation-less agent → excluded, clause D3.5, no math (AC-3c)', () => {
    const agent = attestationlessAgent();
    const incident = testIncident('S-09', { agentId: agent.id });
    const r = adjudicate(inputFor(incident, agent));
    expect(r.conditionsPrecedent.pass).toBe(true); // conditions hold; coverage doesn't
    expect(r.eligibility.covered).toBe(false);
    expect(r.eligibility.clause).toBe('D3.5');
    expect(r.eligibility.reason).toMatch(/unprovable without attested input and output records/);
    expect(r.math).toBeUndefined();
  });

  it('attestation state is read AT EVENT TIME, not now', () => {
    // Attestation operative until after the event, then dropped: still covered.
    const agent = testAgent();
    agent.controlsHistory = {
      ...agent.controlsHistory,
      attestation: [{ from: EPOCH, to: EVENT_AT + DAY_MS }],
    };
    const r = adjudicate(inputFor(testIncident('S-09'), agent));
    expect(r.eligibility.covered).toBe(true);
  });
});

describe('per-event limits (PRD 7.6 limits picture)', () => {
  it('A–D 100% of cap, E 50%, F 15%', () => {
    expect(perEventLimit('A', 50_000)).toBe(50_000);
    expect(perEventLimit('D', 50_000)).toBe(50_000);
    expect(perEventLimit('E', 50_000)).toBe(25_000);
    expect(perEventLimit('F', 50_000)).toBe(7_500);
  });

  it('an $80,000 A-loss on a $50,000 cap clips to $50,000 before deductions', () => {
    expect(applyPerEventLimit('A', 50_000, 80_000)).toBe(50_000);
  });

  it('an E-loss clips at 50% of cap', () => {
    expect(applyPerEventLimit('E', 50_000, 40_000)).toBe(25_000);
  });

  it('F recovery/bounty costs are sub-capped at 10% inside the 15% limit', () => {
    // $6,000 of recovery costs sub-caps to $5,000; +$2,000 other costs = $7,000 ≤ $7,500.
    expect(applyPerEventLimit('F', 50_000, 8_000, 6_000)).toBe(7_000);
    // Whole-F cap still binds.
    expect(applyPerEventLimit('F', 50_000, 20_000, 0)).toBe(7_500);
  });

  it('the clip applies inside adjudicate (C-route loss above the cap)', () => {
    const incident = testIncident('S-18', { lossGrossUsd: 80_000 });
    const m = adjudicate(inputFor(incident)).math!;
    expect(m.coveredQuantumUsd).toBe(80_000);
    expect(m.quantumAfterLimitUsd).toBe(50_000); // clipped to 100% of cap
    // retention = max(1,500, 2% × 80,000 = 1,600) = 1,600.
    expect(m.retentionUsd).toBe(1_600);
    expect(m.payoutUsd).toBe(48_400);
  });
});

describe('the $0 floor — never negative', () => {
  it('a $1,000 loss at $3.00: retention $1,500 → payout exactly $0', () => {
    const incident = testIncident('S-18', { lossGrossUsd: 1_000 });
    const m = adjudicate(inputFor(incident)).math!;
    expect(m.retentionUsd).toBe(1_500); // 500 N floor dominates
    expect(m.payoutUsd).toBe(0);
    expect(m.payoutN).toBe(0);
    expect(m.payoutUsd).toBeGreaterThanOrEqual(0);
  });
});

describe('S-24 hallucinated invoice — model-conduct denial (AC-10)', () => {
  it('eligibility denied, clause 4.9, no math', () => {
    const r = adjudicate(inputFor(testIncident('S-24')));
    expect(r.conditionsPrecedent.pass).toBe(true);
    expect(r.eligibility.covered).toBe(false);
    expect(r.eligibility.clause).toBe('4.9');
    expect(r.eligibility.reason).toMatch(/model conduct/);
    expect(r.eligibility.reason).toMatch(/Coverage B/); // the counterfactual
    expect(r.math).toBeUndefined();
  });
});

describe('S-17 blocked injection — near-miss (Coverage F)', () => {
  it('pays the $2,400 investigation cost with no retention against a $0 loss', () => {
    const r = adjudicate(inputFor(testIncident('S-17')));
    expect(r.eligibility.route).toBe('F');
    const m = r.math!;
    expect(m.grossLossUsd).toBe(0);
    expect(m.coveredQuantumUsd).toBe(2_400);
    expect(m.perEventLimitUsd).toBe(7_500); // 15% of cap
    expect(m.payoutUsd).toBe(2_400);
  });
});

describe('S-18 key exfiltration (Coverage C) + recovery waterfall', () => {
  it('pays $33,500 (= 35,000 − 1,500 retention)', () => {
    const r = adjudicate(inputFor(testIncident('S-18')));
    expect(r.eligibility.route).toBe('C');
    const m = r.math!;
    expect(m.coveredQuantumUsd).toBe(35_000);
    // max(1,500, 2% × 35,000 = 700) = 1,500.
    expect(m.retentionUsd).toBe(1_500);
    expect(m.payoutUsd).toBe(33_500);
  });

  it('the scripted $10,000 recovery goes entirely to the insurer', () => {
    const w = recoveryWaterfall(10_000, 33_500, 1_500);
    expect(w.toInsurerUsd).toBe(10_000);
    expect(w.toInsuredRetainedUsd).toBe(0);
    expect(w.toUninsuredUsd).toBe(0);
  });

  it('overflow repays the retained slice next, then uninsured loss', () => {
    const w = recoveryWaterfall(40_000, 33_500, 3_000);
    expect(w.toInsurerUsd).toBe(33_500);
    expect(w.toInsuredRetainedUsd).toBe(3_000);
    expect(w.toUninsuredUsd).toBe(3_500);
  });
});

describe('conditions precedent gate the pipeline (step 1 before everything)', () => {
  it('an event during revoked verification → not payable, no eligibility analysis', () => {
    const history = [
      { from: EPOCH, to: EVENT_AT - DAY_MS, verified: true },
      { from: EVENT_AT + DAY_MS, verified: true },
    ];
    const input = { ...inputFor(testIncident('S-03')), operatorHistory: history };
    const r = adjudicate(input);
    expect(r.conditionsPrecedent.pass).toBe(false);
    expect(r.eligibility.covered).toBe(false);
    expect(r.eligibility.reason).toMatch(/condition precedent/i);
    expect(r.math).toBeUndefined();
  });
});

describe('coinsurance on the governed slice only (5.5, tier-2 at event time)', () => {
  it('no HITL: 15% of the above-threshold slice', () => {
    const agent = testAgent();
    agent.controlsHistory = { ...agent.controlsHistory, hitl: [] };
    const m = adjudicate(inputFor(testIncident('S-18'), agent)).math!;
    // Governed slice = 35,000 − 25,000 threshold = 10,000 → 15% = 1,500.
    expect(m.coinsuranceUsd).toBe(1_500);
    expect(m.payoutUsd).toBe(35_000 - 1_500 - 1_500);
  });

  it('no kill switch: 15% of the post-first-alert slice only', () => {
    const agent = testAgent();
    agent.controlsHistory = { ...agent.controlsHistory, killSwitch: [] };
    const incident = testIncident('S-18', { postFirstAlertLossUsd: 10_000 });
    const m = adjudicate(inputFor(incident, agent)).math!;
    expect(m.coinsuranceUsd).toBe(1_500); // 15% × 10,000, not 15% × 35,000
  });

  it('unaudited harness: 20% Coverage-D coinsurance (D routes only)', () => {
    const agent = testAgent();
    agent.controlsHistory = { ...agent.controlsHistory, harnessAudit: [] };
    const mD = adjudicate(inputFor(testIncident('S-03'), agent)).math!;
    expect(mD.coinsuranceUsd).toBe(2_000); // 20% × 10,000 D-quantum
    const mC = adjudicate(inputFor(testIncident('S-18'), agent)).math!;
    expect(mC.coinsuranceUsd).toBe(0); // not a D route
  });

  it('no recovery mechanism: 20% of the recoverable slice', () => {
    const agent = testAgent();
    agent.controlsHistory = { ...agent.controlsHistory, recovery: [] };
    const incident = testIncident('S-18', { recoverableUsd: 5_000 });
    const m = adjudicate(inputFor(incident, agent)).math!;
    expect(m.coinsuranceUsd).toBe(1_000); // 20% × 5,000
  });
});
