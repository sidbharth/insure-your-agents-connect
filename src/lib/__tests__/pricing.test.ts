/**
 * Pricing engine tests (plan §4/§9, PRD §8 worked examples, AC-1/3a/4).
 */
import { describe, expect, it } from 'vitest';
import {
  deEnrollRefund,
  premiumN,
  priceAgent,
  proRataRefund,
  renewalPreview,
  repriceDelta,
  type PricingInput,
} from '../pricing';
import type { Tier1Gate, Tier2Control } from '../../store/types';
import { allOnInput, DAY_MS, EPOCH, testEnrollment, testIncident } from './fixtures';

function quoted(input: PricingInput) {
  const r = priceAgent(input);
  if (r.kind !== 'quoted') throw new Error('expected a quote, got declined');
  return r;
}

describe('priceAgent — worked examples (PRD §8)', () => {
  it('example 1: all controls on, $50,000 cap → 0.6%, $300/yr = 100 N at $3.00 (AC-1)', () => {
    const r = quoted(allOnInput());
    expect(r.ladderRatePct).toBe(0.6);
    expect(r.loadingsPct).toBe(0);
    expect(r.totalRatePct).toBe(0.6);
    expect(r.premiumUsd).toBe(300);
    expect(premiumN(r.premiumUsd, 3)).toBe(100);
    expect(r.ceilingReached).toBe(false);
    // All-on coverage flags: nothing excluded, no coinsurance, no trap.
    expect(r.flags).toEqual({
      coverageBExcluded: false,
      kybClaimsTrap: false,
      recoveryCoins20: false,
      auditCoins20: false,
      hitlCoins15: false,
      killSwitchCoins15: false,
    });
  });

  it('example 2: attestation + timelock skipped → 1.5%, $750/yr', () => {
    const r = quoted(
      allOnInput({
        tier2: { ...allOnInput().tier2, attestation: false, timelock: false },
      }),
    );
    expect(r.ladderRatePct).toBe(1.5);
    expect(r.premiumUsd).toBe(750);
    expect(r.flags.coverageBExcluded).toBe(true);
  });

  it('example 3: all tier-2 skipped → ladder exactly 3.0%, $1,500/yr = 500 N, ceiling reached', () => {
    const allOff = Object.fromEntries(
      Object.keys(allOnInput().tier2).map((k) => [k, false]),
    ) as unknown as PricingInput['tier2'];
    const r = quoted(allOnInput({ tier2: allOff }));
    expect(r.ladderRatePct).toBe(3.0);
    expect(r.totalRatePct).toBe(3.0);
    expect(r.premiumUsd).toBe(1_500);
    expect(premiumN(r.premiumUsd, 3)).toBe(500);
    expect(r.ceilingReached).toBe(true);
  });
});

describe('priceAgent — every single-toggle delta (AC-4)', () => {
  const deltas: Record<Tier2Control, number> = {
    attestation: 0.6,
    kyb: 0.4,
    timelock: 0.3,
    recovery: 0.3,
    harnessAudit: 0.3,
    hitl: 0.3,
    killSwitch: 0.2,
  };
  for (const [control, delta] of Object.entries(deltas) as [Tier2Control, number][]) {
    it(`skipping ${control} adds exactly +${delta}%`, () => {
      const base = quoted(allOnInput());
      const r = quoted(
        allOnInput({ tier2: { ...allOnInput().tier2, [control]: false } }),
      );
      expect(r.ladderRatePct - base.ladderRatePct).toBeCloseTo(delta, 10);
      // The engine computes in integer tenths, so the displayed rate is
      // drift-free (e.g. exactly 0.9, not 0.8999999999999999).
      expect(r.ladderRatePct).toBe(Math.round((0.6 + delta) * 10) / 10);
      // The surcharge appears as a ladder line with a clause ref.
      const line = r.breakdown.find(
        (l) => l.group === 'ladder' && l.points === delta && l.label !== 'Base rate (fully compliant)',
      );
      expect(line).toBeDefined();
      expect(line!.clause).toBeTruthy();
    });
  }

  it('coinsurance/coverage flags track the skipped control', () => {
    const t2 = allOnInput().tier2;
    expect(quoted(allOnInput({ tier2: { ...t2, kyb: false } })).flags.kybClaimsTrap).toBe(true);
    expect(quoted(allOnInput({ tier2: { ...t2, recovery: false } })).flags.recoveryCoins20).toBe(true);
    expect(quoted(allOnInput({ tier2: { ...t2, harnessAudit: false } })).flags.auditCoins20).toBe(true);
    expect(quoted(allOnInput({ tier2: { ...t2, hitl: false } })).flags.hitlCoins15).toBe(true);
    expect(quoted(allOnInput({ tier2: { ...t2, killSwitch: false } })).flags.killSwitchCoins15).toBe(true);
  });
});

describe('priceAgent — tier-1 gates decline, never price (GT-1, AC-2)', () => {
  const gates: Tier1Gate[] = ['hashIdentity', 'transferCaps', 'whitelist', 'actionLogging'];
  for (const gate of gates) {
    it(`any single gate off (${gate}) → declined, naming the gate`, () => {
      const r = priceAgent(
        allOnInput({ tier1: { ...allOnInput().tier1, [gate]: false } }),
      );
      expect(r.kind).toBe('declined');
      if (r.kind === 'declined') expect(r.missingGates).toHaveLength(1);
    });
  }

  it('multiple gates off → declined naming every missing gate', () => {
    const r = priceAgent(
      allOnInput({
        tier1: { hashIdentity: true, transferCaps: false, whitelist: false, actionLogging: false },
      }),
    );
    expect(r.kind).toBe('declined');
    if (r.kind === 'declined') {
      expect(r.missingGates).toEqual([
        'transfer caps',
        'whitelist enforcement',
        'action logging',
      ]);
    }
  });
});

describe('priceAgent — loadings applied AFTER the clamp (plan §4 display rule)', () => {
  it('concentration +0.1 and openSet +0.3 are loading lines, not ladder slices', () => {
    const r = quoted(allOnInput({ concentrationLoading: true, openSet: true }));
    expect(r.ladderRatePct).toBe(0.6);
    expect(r.loadingsPct).toBeCloseTo(0.4, 10);
    expect(r.totalRatePct).toBe(1.0);
    const loadingLines = r.breakdown.filter((l) => l.group === 'loading');
    expect(loadingLines.map((l) => l.points).sort()).toEqual([0.1, 0.3]);
  });

  it('total maxes at 3.4% (ladder clamped at 3.0 + both loadings)', () => {
    const allOff = Object.fromEntries(
      Object.keys(allOnInput().tier2).map((k) => [k, false]),
    ) as unknown as PricingInput['tier2'];
    const r = quoted(allOnInput({ tier2: allOff, concentrationLoading: true, openSet: true }));
    expect(r.ladderRatePct).toBe(3.0);
    expect(r.loadingsPct).toBeCloseTo(0.4, 10);
    expect(r.totalRatePct).toBe(3.4);
    expect(r.premiumUsd).toBe(1_700);
    expect(r.ceilingReached).toBe(true);
  });
});

describe('proRataRefund (T5.3)', () => {
  it('refunds a surcharge slice pro rata from the verification date to renewal', () => {
    const renewalAt = EPOCH + 365 * DAY_MS;
    const from = renewalAt - 182.5 * DAY_MS; // exactly half the year remains
    const r = proRataRefund(0.4, 50_000, from, renewalAt, from);
    // 0.4% × $50,000 = $200/yr; half remaining → $100.
    expect(r.usd).toBe(100);
    expect(r.breakdown.clause).toBe('T5.3');
  });

  it('never refunds cover already consumed (fromDate before now)', () => {
    const renewalAt = EPOCH + 365 * DAY_MS;
    const now = renewalAt - 100 * DAY_MS;
    const r = proRataRefund(0.6, 50_000, EPOCH, renewalAt, now);
    // 0.6% × $50,000 = $300/yr × 100/365 remaining.
    expect(r.usd).toBeCloseTo((300 * 100) / 365, 2);
  });

  it('returns $0 at/after renewal', () => {
    const renewalAt = EPOCH + 365 * DAY_MS;
    expect(proRataRefund(0.4, 50_000, renewalAt, renewalAt, renewalAt).usd).toBe(0);
  });
});

describe('repriceDelta (§9a) — pro-rated for the remaining term', () => {
  it('deltaUsd = (newAnnual − oldAnnual) × remainingDays / 365', () => {
    const renewalAt = EPOCH + 365 * DAY_MS;
    const effectiveAt = renewalAt - 73 * DAY_MS; // 73/365 = 0.2 of a year left
    const oldInput = allOnInput(); // $300/yr
    const newInput = allOnInput({ capUsd: 100_000 }); // $600/yr
    const r = repriceDelta(oldInput, newInput, effectiveAt, renewalAt);
    expect(r.deltaUsd).toBeCloseTo((600 - 300) * 0.2, 2);
    expect(r.breakdown.clause).toBe('T5.2');
  });

  it('a cheaper new mandate yields a negative pro-rated delta', () => {
    const renewalAt = EPOCH + 365 * DAY_MS;
    const effectiveAt = EPOCH; // whole year left
    const oldInput = allOnInput({ capUsd: 100_000 }); // $600
    const newInput = allOnInput(); // $300
    const r = repriceDelta(oldInput, newInput, effectiveAt, renewalAt);
    expect(r.deltaUsd).toBeCloseTo(-300, 2);
  });
});

describe('deEnrollRefund (§9b, D7 + exception)', () => {
  it('refunds the remaining term pro rata when no claim was paid or noticed', () => {
    const enrollment = testEnrollment(); // $300/yr, renewal EPOCH+365d
    const now = EPOCH + 292 * DAY_MS; // 73 days = 0.2 of a year remain
    const r = deEnrollRefund(enrollment, { claims: [], incidents: [] }, now);
    expect(r.usd).toBeCloseTo(300 * 0.2, 2);
    expect('breakdown' in r).toBe(true);
  });

  it('returns $0 with the reason once an incident is noticed on the agent (D7 exception)', () => {
    const enrollment = testEnrollment();
    const incident = testIncident('S-09'); // references procurement-bot
    const r = deEnrollRefund(enrollment, { claims: [], incidents: [incident] }, EPOCH + 30 * DAY_MS);
    expect(r.usd).toBe(0);
    if (!('breakdown' in r)) expect(r.reason).toBe('claim paid or noticed');
  });

  it('returns $0 with the reason after a claim was paid on the agent', () => {
    const enrollment = testEnrollment();
    const incident = testIncident('S-03');
    const paidClaim = {
      id: 'claim-1',
      incidentId: incident.id,
      conditionsPrecedent: { pass: true },
      evidence: [],
      clockState: {
        phase: 'Paid' as const,
        anchors: { discoveredAt: incident.discoveredAt, paidAt: EPOCH + 40 * DAY_MS },
      },
    };
    const r = deEnrollRefund(
      enrollment,
      { claims: [paidClaim], incidents: [incident] },
      EPOCH + 50 * DAY_MS,
    );
    expect(r.usd).toBe(0);
  });

  it("another agent's incident does not zero the refund", () => {
    const enrollment = testEnrollment();
    const otherIncident = testIncident('S-18', { agentId: 'legacy-bot' });
    const r = deEnrollRefund(
      enrollment,
      { claims: [], incidents: [otherIncident] },
      EPOCH + 292 * DAY_MS,
    );
    expect(r.usd).toBeGreaterThan(0);
  });
});

describe('renewalPreview (§9c, AC-11)', () => {
  it('clean year with no near-misses: −0.05%', () => {
    expect(renewalPreview(0.6, 0, true).renewalRatePct).toBe(0.55);
  });

  it('each reported near-miss moves the preview by exactly −0.01%', () => {
    expect(renewalPreview(0.6, 1, true).renewalRatePct).toBe(0.54);
    expect(renewalPreview(0.6, 2, true).renewalRatePct).toBe(0.53);
    expect(
      renewalPreview(0.6, 1, true).renewalRatePct - renewalPreview(0.6, 2, true).renewalRatePct,
    ).toBeCloseTo(0.01, 10);
  });

  it('never drops below the 0.45% floor', () => {
    expect(renewalPreview(0.6, 50, false).renewalRatePct).toBe(0.45);
    expect(renewalPreview(0.45, 0, false).renewalRatePct).toBe(0.45);
  });

  it('movement is bounded to ±0.15 when nothing about the setup changed', () => {
    // 1.5% − 0.05 − 0.20 (20 near-misses) = 1.25 → bound clamps to 1.35.
    expect(renewalPreview(1.5, 20, true).renewalRatePct).toBe(1.35);
    // Setup changed → no bound: full credit applies.
    expect(renewalPreview(1.5, 20, false).renewalRatePct).toBe(1.25);
  });
});
