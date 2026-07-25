/**
 * WP-1 tests — payments engine (plan §7a, REQ-6.2, REQ-7.8.1, AC-7).
 *
 * paymentPreflight: one NAMED blocker per missing leg.
 * executePayment: refetch-first for all kinds, receipt at the POST-refetch
 * rate, recordPayment called before the receipt is returned, and the module
 * itself never activates anything.
 */
import { describe, it, expect } from 'vitest';
import {
  paymentPreflight,
  executePayment,
  registerPaymentPorts,
  type PaymentPorts,
  type PaymentReceipt,
  type PaymentSessionView,
} from '../payments';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function readyAgent(id = 'agent-helios-01') {
  return {
    id,
    configHash: '0xabc123',
    ownershipVerified: true,
    tier1AllOn: true,
    mandateCountersigned: true,
  };
}

function readySession(): PaymentSessionView {
  return { agents: [readyAgent()], paymentMethodSelected: true };
}

const T0 = Date.UTC(2026, 5, 12, 9, 0, 0);

/**
 * Fake ports where refetchNow() CHANGES the rate getUsdPerN() returns —
 * proves the receipt uses the post-refetch rate, and records call order.
 */
function fakePorts(opts?: { preRate?: number; postRate?: number }) {
  const preRate = opts?.preRate ?? 3.0;
  const postRate = opts?.postRate ?? 2.5;
  let rate = preRate;
  const calls: string[] = [];
  const recorded: PaymentReceipt[] = [];
  const ports: PaymentPorts = {
    refetchNow: async () => {
      calls.push('refetchNow');
      rate = postRate;
    },
    getUsdPerN: () => {
      calls.push('getUsdPerN');
      return rate;
    },
    now: () => T0,
    recordPayment: (receipt) => {
      calls.push('recordPayment');
      recorded.push(receipt);
    },
  };
  return { ports, calls, recorded };
}

// ---------------------------------------------------------------------------
// paymentPreflight — named blockers per missing leg
// ---------------------------------------------------------------------------

describe('paymentPreflight', () => {
  it('passes when every leg is in place', () => {
    expect(paymentPreflight(readySession(), 'initial-premium')).toEqual({ ok: true });
  });

  it('blocks on unregistered config hash with a named blocker', () => {
    const session = readySession();
    session.agents[0].configHash = '';
    const result = paymentPreflight(session, 'initial-premium');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].key).toBe('hash-not-registered:agent-helios-01');
      expect(result.blockers[0].reason).toMatch(/fingerprinted agent/);
    }
  });

  it('blocks on unverified ownership with a named blocker', () => {
    const session = readySession();
    session.agents[0].ownershipVerified = false;
    const result = paymentPreflight(session, 'initial-premium');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers.map((b) => b.key)).toEqual([
        'ownership-not-verified:agent-helios-01',
      ]);
    }
  });

  it('blocks on missing countersignature, citing T3.2', () => {
    const session = readySession();
    session.agents[0].mandateCountersigned = false;
    const result = paymentPreflight(session, 'initial-premium');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers[0].key).toBe('mandate-not-countersigned:agent-helios-01');
      expect(result.blockers[0].reason).toMatch(/no countersignature, no cover/);
      expect(result.blockers[0].reason).toMatch(/T3\.2/);
    }
  });

  it('blocks on a tier-1 gate being off, citing GT-1', () => {
    const session = readySession();
    session.agents[0].tier1AllOn = false;
    const result = paymentPreflight(session, 'initial-premium');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers[0].key).toBe('tier1-gate-off:agent-helios-01');
      expect(result.blockers[0].reason).toMatch(/GT-1/);
    }
  });

  it('blocks on missing payment method for every scope', () => {
    for (const scope of ['initial-premium', 'delta', 'claim-settlement'] as const) {
      const session = readySession();
      session.paymentMethodSelected = false;
      const result = paymentPreflight(session, scope);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.blockers.map((b) => b.key)).toContain('payment-method-not-selected');
      }
    }
  });

  it('accumulates one blocker per missing leg per agent', () => {
    const session: PaymentSessionView = {
      agents: [
        {
          id: 'a1',
          configHash: '',
          ownershipVerified: false,
          tier1AllOn: false,
          mandateCountersigned: false,
        },
        readyAgent('a2'),
      ],
      paymentMethodSelected: false,
    };
    const result = paymentPreflight(session, 'initial-premium');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers.map((b) => b.key).sort()).toEqual(
        [
          'hash-not-registered:a1',
          'mandate-not-countersigned:a1',
          'ownership-not-verified:a1',
          'payment-method-not-selected',
          'tier1-gate-off:a1',
        ].sort(),
      );
    }
  });

  it('delta and claim-settlement scopes only require a payment method', () => {
    const session: PaymentSessionView = {
      agents: [
        {
          id: 'a1',
          configHash: '',
          ownershipVerified: false,
          tier1AllOn: false,
          mandateCountersigned: false,
        },
      ],
      paymentMethodSelected: true,
    };
    expect(paymentPreflight(session, 'delta')).toEqual({ ok: true });
    expect(paymentPreflight(session, 'claim-settlement')).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// executePayment — refetch-first, post-refetch rate, record-before-return
// ---------------------------------------------------------------------------

describe('executePayment', () => {
  it('throws if no ports have been registered', async () => {
    // This file never imports the store assembly, so the module-level
    // singleton starts unwired. Tests in this describe block run in order;
    // this one runs FIRST, before any registerPaymentPorts call below.
    await expect(
      executePayment('initial', 300, { agentIds: ['a1'] }),
    ).rejects.toThrow(/registerPaymentPorts\(\) has not been called/);
  });

  it('awaits refetchNow BEFORE reading the rate, for all three kinds', async () => {
    for (const kind of ['initial', 'delta', 'claim-settlement'] as const) {
      const { ports, calls } = fakePorts();
      registerPaymentPorts(ports);
      await executePayment(kind, 300, { agentIds: ['a1'] });
      expect(calls[0]).toBe('refetchNow');
      expect(calls.indexOf('refetchNow')).toBeLessThan(calls.indexOf('getUsdPerN'));
    }
  });

  it('uses the POST-refetch rate on the receipt (rate moves during refetch)', async () => {
    const { ports } = fakePorts({ preRate: 3.0, postRate: 2.5 });
    registerPaymentPorts(ports);
    const receipt = await executePayment('initial', 300, { agentIds: ['a1'] });
    expect(receipt.rateUsed).toBe(2.5);
    expect(receipt.amountN).toBe(120); // 300 / 2.5, NOT 100 at the stale 3.00
    expect(receipt.amountUsd).toBe(300);
    expect(receipt.paidAt).toBe(T0);
    expect(receipt.kind).toBe('initial');
    expect(receipt.targets).toEqual({ agentIds: ['a1'] });
  });

  it('records the payment BEFORE returning the receipt, and records exactly once', async () => {
    const { ports, calls, recorded } = fakePorts();
    registerPaymentPorts(ports);
    const receipt = await executePayment('claim-settlement', 18500, {
      claimId: 'claim-1',
    });
    expect(calls.filter((c) => c === 'recordPayment')).toHaveLength(1);
    expect(calls[calls.length - 1]).toBe('recordPayment');
    expect(recorded[0]).toEqual(receipt);
  });

  it('never activates anything — the only side effects are the injected ports', async () => {
    const { ports, calls } = fakePorts();
    registerPaymentPorts(ports);
    await executePayment('delta', 60, { agentIds: ['a1', 'a2'] });
    // Exhaustive side-effect list: refetch, rate read, record. Nothing else.
    expect(calls).toEqual(['refetchNow', 'getUsdPerN', 'recordPayment']);
  });
});
