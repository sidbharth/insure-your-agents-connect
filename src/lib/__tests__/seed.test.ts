/**
 * Appendix B seed assertions (plan §7 / WP-0 test list):
 * - fleet roll-up 6×$300 + 5×$350 + $600 = $4,150 ≈ 1,383.33 N at $3.00
 * - Vendor-Bot prospective share exactly 40.0000% = 2,340,000 / 5,850,000
 * - Settle-Bot 40.5085% = 2,390,000 / 5,900,000
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_AGENT_SPECS,
  createSeedBook,
  createSeedState,
  createDefaultMandate,
  FLEET_IMPORT_ORDER,
  HELIOS,
  SEED_CAP_USD,
  SEED_EPOCH,
  SEED_PAYEES,
  SEED_USD_PER_N,
  SEED_WALLET_BALANCE_N,
  WIZARD_AGENT,
} from '../../data/seed';
import { configHash, shortHash } from '../hash';

const DAY_MS = 24 * 3_600_000;

describe('Appendix B fleet roll-up', () => {
  it('prices 6×$300 + 5×$350 + $600 = $4,150/yr ≈ 1,383.33 N at $3.00', () => {
    // Round to cents: rate points are display percentages (e.g. 0.7% of
    // $50,000 = $350), not IEEE-754-exact fractions.
    const premiums = ALL_AGENT_SPECS.map(
      (spec) => Math.round(spec.seedRatePct * SEED_CAP_USD) / 100,
    );
    const at300 = premiums.filter((p) => p === 300);
    const at350 = premiums.filter((p) => p === 350);
    const at600 = premiums.filter((p) => p === 600);
    expect(at300).toHaveLength(6);
    expect(at350).toHaveLength(5);
    expect(at600).toHaveLength(1);

    const totalUsd = premiums.reduce((a, b) => a + b, 0);
    expect(totalUsd).toBe(4_150);
    expect(totalUsd / SEED_USD_PER_N).toBeCloseTo(1_383.33, 2);
  });

  it('keeps the wallet above the 1,383 N roll-up', () => {
    expect(SEED_WALLET_BALANCE_N).toBeGreaterThan(1_383);
  });

  it('has 12 agents, every cap $50,000, in the fixed import order', () => {
    expect(ALL_AGENT_SPECS).toHaveLength(12);
    expect(WIZARD_AGENT.name).toBe('Procurement-Bot');
    expect(FLEET_IMPORT_ORDER.map((s) => s.name)).toEqual([
      'Legacy-Bot',
      'Relay-Bot',
      'Payables-Bot',
      'Refunds-Bot',
      'Treasury-Bot',
      'Vendor-Bot',
      'Settle-Bot',
      'Invoice-Bot',
      'Renewals-Bot',
      'Deposits-Bot',
      'Clearing-Bot',
    ]);
    expect(SEED_CAP_USD).toBe(50_000);
  });
});

describe('Appendix B concentration crossings (prospective post-enrollment book)', () => {
  /**
   * Walk the seeded enrollment sequence exactly as the fleet import will:
   * Procurement-Bot first (wizard), then the fixed import order. Prospective
   * share = (componentCaps + addedCap) / (totalCaps + addedCap).
   */
  function walkShares() {
    const book = createSeedBook();
    const external = book.components.reduce((a, c) => a + c.externalCapsUsd, 0);
    let heliosCaps = book.components.find((c) => c.harness === HELIOS)!.externalCapsUsd;
    let totalCaps = external;
    const rows: { name: string; prospectiveHeliosShare: number }[] = [];

    for (const spec of [WIZARD_AGENT, ...FLEET_IMPORT_ORDER]) {
      const prospectiveHelios =
        spec.harnessKey === HELIOS ? heliosCaps + SEED_CAP_USD : heliosCaps;
      const prospectiveTotal = totalCaps + SEED_CAP_USD;
      rows.push({
        name: spec.name,
        prospectiveHeliosShare: prospectiveHelios / prospectiveTotal,
      });
      totalCaps = prospectiveTotal;
      if (spec.harnessKey === HELIOS) heliosCaps = prospectiveHelios;
    }
    return rows;
  }

  it('starts the book at Helios $2,090,000 of $5,500,000 = 38.0%', () => {
    const book = createSeedBook();
    const helios = book.components.find((c) => c.harness === HELIOS)!;
    const total = book.components.reduce((a, c) => a + c.externalCapsUsd, 0);
    expect(helios.externalCapsUsd).toBe(2_090_000);
    expect(total).toBe(5_500_000);
    expect(helios.externalCapsUsd / total).toBeCloseTo(0.38, 4);
  });

  it('Procurement-Bot takes Helios to 2,140,000/5,550,000 = 38.6%', () => {
    const rows = walkShares();
    expect(rows[0].name).toBe('Procurement-Bot');
    expect(rows[0].prospectiveHeliosShare).toBeCloseTo(2_140_000 / 5_550_000, 10);
    expect(rows[0].prospectiveHeliosShare).toBeCloseTo(0.3856, 4);
  });

  it('Vendor-Bot lands at exactly 40.0000% (2,340,000/5,850,000) → no loading', () => {
    const vendor = walkShares().find((r) => r.name === 'Vendor-Bot')!;
    expect(vendor.prospectiveHeliosShare).toBe(2_340_000 / 5_850_000);
    expect(vendor.prospectiveHeliosShare).toBe(0.4);
    // strictly-greater threshold: exactly 40% carries NO loading
    expect(vendor.prospectiveHeliosShare > 0.4).toBe(false);
  });

  it('Settle-Bot crosses at 40.5085% (2,390,000/5,900,000) → loading', () => {
    const settle = walkShares().find((r) => r.name === 'Settle-Bot')!;
    expect(settle.prospectiveHeliosShare).toBe(2_390_000 / 5_900_000);
    expect(settle.prospectiveHeliosShare * 100).toBeCloseTo(40.5085, 4);
    expect(settle.prospectiveHeliosShare > 0.4).toBe(true);
  });

  it('tags exactly Settle-Bot and the four after it with the concentration loading', () => {
    const tagged = ALL_AGENT_SPECS.filter((s) => s.concentrationTag).map((s) => s.name);
    expect(tagged).toEqual([
      'Settle-Bot',
      'Invoice-Bot',
      'Renewals-Bot',
      'Deposits-Bot',
      'Clearing-Bot',
    ]);
  });
});

describe('seed integrity', () => {
  it('Legacy-Bot has attestation.available === false (REQ-7.3.3) and Coverage B excluded', () => {
    const seed = createSeedState();
    const legacy = seed.agents.find((a) => a.name === 'Legacy-Bot')!;
    expect(legacy.attestation.available).toBe(false);
    expect(legacy.controls.tier2.attestation).toBe(false);
    const spec = FLEET_IMPORT_ORDER.find((s) => s.name === 'Legacy-Bot')!;
    expect(spec.seedRatePct).toBe(1.2);
    expect(spec.coverageBExcluded).toBe(true);
  });

  it('seeds six whitelisted payees, each older than the 24 h cooling period', () => {
    expect(SEED_PAYEES).toHaveLength(6);
    for (const payee of SEED_PAYEES) {
      expect(SEED_EPOCH - payee.addedAt).toBeGreaterThan(DAY_MS);
    }
  });

  it('generates deterministic config hashes', () => {
    const seedA = createSeedState();
    const seedB = createSeedState();
    for (let i = 0; i < seedA.agents.length; i++) {
      expect(seedA.agents[i].configHash).toBe(seedB.agents[i].configHash);
      expect(seedA.agents[i].configHash).toMatch(/^0x[0-9a-f]{40}$/);
    }
    expect(configHash('x')).toBe(configHash('x'));
    expect(configHash('x')).not.toBe(configHash('y'));
    expect(shortHash(seedA.agents[0].configHash)).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
  });

  it('opens every gate/control/verification interval from the seed epoch', () => {
    const seed = createSeedState();
    expect(seed.operator.verificationHistory).toEqual([
      { from: SEED_EPOCH, verified: true },
    ]);
    for (const agent of seed.agents) {
      for (const intervals of Object.values(agent.gateHistory)) {
        expect(intervals).toEqual([{ from: SEED_EPOCH }]);
      }
      const attIntervals = agent.controlsHistory.attestation;
      if (agent.attestation.available) {
        expect(attIntervals).toEqual([{ from: SEED_EPOCH }]);
      } else {
        expect(attIntervals).toEqual([]);
      }
    }
  });

  it('seeds the price UNPINNED at $3.00 (plan §6 / AC-16)', () => {
    const seed = createSeedState();
    expect(seed.priceFeed.pinned).toBe(false);
    expect(seed.priceFeed.usdPerN).toBe(3.0);
    expect(seed.priceFeed.pinnedValue).toBe(3.0);
  });

  it('defaults the mandate per-tx cap to $50,000 with a 24 h cooling period', () => {
    const mandate = createDefaultMandate();
    expect(mandate.caps.perTx).toBe(50_000);
    expect(mandate.whitelist.coolingHours).toBe(24);
    expect(mandate.whitelist.openSet).toBe(false);
    expect(mandate.countersigned).toBeUndefined();
  });
});
