/**
 * WP-2 wizard helpers: timestamp formatting, deterministic nonces/signatures,
 * pricing-input assembly, and MathBreakdown builders for the wizard screens
 * (7.1–7.5). New file owned by WP-2 — shared files stay untouched.
 */
import { configHash } from '../../lib/hash';
import { formatPct, formatUsd, type MathBreakdown } from '../../lib/money';
import type { PricingInput, PricingResult } from '../../lib/pricing';
import type { Agent, Mandate, Timestamp } from '../../store/types';

/** "2026-07-24 · 14:26:12 UTC" — the mockups' timestamp form. */
export function formatUtcStamp(ts: Timestamp): string {
  const iso = new Date(ts).toISOString(); // 2026-07-24T14:26:12.000Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** Deterministic challenge nonce, e.g. "8c41-d2f0-99ab" (REQ-6.6). */
export function challengeNonce(agentId: string): string {
  const hex = configHash(`${agentId}:ownership-nonce`).slice(2);
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Deterministic fake signing-key label, e.g. "ed25519:9b02…44aa". */
export function signingKeyLabel(agentId: string): string {
  const hex = configHash(`${agentId}:signing-key`).slice(2);
  return `ed25519:${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/**
 * Assemble the pricing engine's input from live state (plan §4). The KYB
 * tier-2 control mirrors the 7.2 verification state (plan §8, 7.5): an
 * unverified operator prices as KYB-skipped no matter the agent flag.
 */
export function buildPricingInput(
  agent: Agent,
  mandate: Mandate,
  operatorVerified: boolean,
  opts: { concentrationLoading?: boolean } = {},
): PricingInput {
  return {
    capUsd: mandate.caps.perTx,
    tier1: { ...agent.controls.tier1 },
    tier2: {
      ...agent.controls.tier2,
      kyb: agent.controls.tier2.kyb && operatorVerified,
    },
    openSet: mandate.whitelist.openSet,
    concentrationLoading: opts.concentrationLoading ?? false,
  };
}

/**
 * The premium figure's full arithmetic for MathValue (REQ-6.7, AC-14):
 * every ladder slice with its clause ref, the clamp, loadings, and the
 * premium = rate × cap step.
 */
export function premiumBreakdown(
  result: Extract<PricingResult, { kind: 'quoted' }>,
  capUsd: number,
): MathBreakdown {
  const ladder = result.breakdown.filter((l) => l.group === 'ladder');
  const loadings = result.breakdown.filter((l) => l.group === 'loading');
  const ladderSum = ladder.map((l) => l.points.toFixed(1)).join(' + ');
  const loadingsPart =
    loadings.length > 0 ? ` + loadings ${formatPct(result.loadingsPct)}` : '';
  return {
    title: 'Annual premium: rate × cap',
    inputs: result.breakdown.map((l, i) => ({
      label: l.label,
      amount: formatPct(l.points, { signed: i > 0 }),
      clause: l.clause,
    })),
    formula: `min(${ladderSum}, 3.0)%${loadingsPart} = ${formatPct(result.totalRatePct)} × ${formatUsd(capUsd)} = ${formatUsd(result.premiumUsd)} / yr`,
    clause: 'Appendix 3 rate schedule',
    resultUsd: result.premiumUsd,
  };
}
