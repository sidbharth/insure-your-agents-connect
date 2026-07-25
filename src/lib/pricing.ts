/**
 * THE pure pricing engine (plan §4, PRD §8) — FROZEN SIGNATURES (WP-1).
 *
 * Order of operations (exact): base 0.6 + skipped-tier-2 surcharges
 * (attestation 0.6, KYB 0.4, timelock/recovery/audit/HITL 0.3 each,
 * killSwitch 0.2) → ladderRatePct = min(rate, 3.0) → loadings AFTER the
 * clamp (concentration +0.1, open-set +0.3; displayed total may reach 3.4).
 * Tier-1 never appears in the formula: it gates, it never prices (GT-1).
 *
 * All rate arithmetic runs in integer TENTHS of a point (base = 6, ceiling
 * = 30) so the ladder reaches 3.0 exactly with no floating-point drift.
 */
import type {
  Enrollment,
  RateLine,
  Tier1Controls,
  Tier2Controls,
  Timestamp,
  Claim,
  Incident,
  Tier1Gate,
  Tier2Control,
} from '../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../store/types';
import type { MathBreakdown } from './money';
import { formatPct, formatUsd } from './money';

export interface PricingInput {
  capUsd: number;
  tier1: Tier1Controls;
  tier2: Tier2Controls;
  /** Mandate open counterparty set (+0.3% post-clamp loading). */
  openSet: boolean;
  /** Decided by concentration.ts at enrollment time (§4b). */
  concentrationLoading: boolean;
}

export interface PricingFlags {
  coverageBExcluded: boolean;
  kybClaimsTrap: boolean;
  recoveryCoins20: boolean;
  auditCoins20: boolean;
  hitlCoins15: boolean;
  killSwitchCoins15: boolean;
}

export type PricingResult =
  | { kind: 'declined'; missingGates: string[] }
  | {
      kind: 'quoted';
      /** Base + tier-2 surcharges, clamped at 3.0 (the tier-2 ladder ceiling). */
      ladderRatePct: number;
      /** Concentration 0.1 + openSet 0.3, applied after the clamp. */
      loadingsPct: number;
      /** ladderRatePct + loadingsPct (max 3.4). */
      totalRatePct: number;
      /** totalRatePct × cap. */
      premiumUsd: number;
      breakdown: RateLine[];
      /** Ladder hit 3.0 exactly. */
      ceilingReached: boolean;
      flags: PricingFlags;
    };

const DAY_MS = 24 * 3_600_000;
const YEAR_DAYS = 365;

/** Ladder ceiling in tenths of a point (3.0%). */
const CEILING_TENTHS = 30;
/** Base rate in tenths of a point (0.6%). */
const BASE_TENTHS = 6;

/** Human names for the four gates (declined copy, REQ-7.5.1). */
export const GATE_LABELS: Record<Tier1Gate, string> = {
  hashIdentity: 'registered hash identity',
  transferCaps: 'transfer caps',
  whitelist: 'whitelist enforcement',
  actionLogging: 'action logging',
};

interface SurchargeSpec {
  control: Tier2Control;
  tenths: number;
  label: string;
  clause: string;
  coverageEffect?: string;
}

/** Skipped-tier-2 surcharges (rate schedule, Appendix 3), in ladder order. */
export const TIER2_SURCHARGES: readonly SurchargeSpec[] = [
  {
    control: 'attestation',
    tenths: 6,
    label: 'No TEE attestation',
    clause: 'Appendix 3, D3.5',
    coverageEffect: 'Coverage B excluded',
  },
  {
    control: 'kyb',
    tenths: 4,
    label: 'No company verification (KYB)',
    clause: 'Appendix 3, T3.4',
    coverageEffect: 'no event during an unverified period is claimable',
  },
  {
    control: 'timelock',
    tenths: 3,
    label: 'No timelock on large transfers',
    clause: 'Appendix 3',
  },
  {
    control: 'recovery',
    tenths: 3,
    label: 'No recovery mechanism',
    clause: 'Appendix 3, 5.5',
    coverageEffect: '20% recovery coinsurance',
  },
  {
    control: 'harnessAudit',
    tenths: 3,
    label: 'No independent harness audit',
    clause: 'Appendix 3, 5.5',
    coverageEffect: '20% Coverage-D coinsurance until first audit',
  },
  {
    control: 'hitl',
    tenths: 3,
    label: 'No human approval above threshold',
    clause: 'Appendix 3, 5.5',
    coverageEffect: '15% above-threshold coinsurance',
  },
  {
    control: 'killSwitch',
    tenths: 2,
    label: 'No kill switch + anomaly monitoring',
    clause: 'Appendix 3, 5.5',
    coverageEffect: '15% post-first-alert coinsurance',
  },
] as const;

function roundCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

export function priceAgent(input: PricingInput): PricingResult {
  // Tier-1 gates: any OFF ⇒ DECLINED naming the gate(s), never a price (GT-1).
  const missingGates = TIER1_GATES.filter((g) => !input.tier1[g]).map(
    (g) => GATE_LABELS[g],
  );
  if (missingGates.length > 0) {
    return { kind: 'declined', missingGates };
  }

  const breakdown: RateLine[] = [
    { label: 'Base rate (fully compliant)', points: 0.6, clause: 'Appendix 3', group: 'ladder' },
  ];

  // 1. Ladder: base + skipped-tier-2 surcharges (integer tenths).
  let ladderTenths = BASE_TENTHS;
  for (const s of TIER2_SURCHARGES) {
    if (!input.tier2[s.control]) {
      ladderTenths += s.tenths;
      breakdown.push({
        label: s.label,
        points: s.tenths / 10,
        clause: s.clause,
        group: 'ladder',
        coverageEffect: s.coverageEffect,
      });
    }
  }

  // 2. Clamp at the 3.0% ladder ceiling.
  const clampedTenths = Math.min(ladderTenths, CEILING_TENTHS);
  const ceilingReached = ladderTenths >= CEILING_TENTHS;

  // 3. Loadings AFTER the clamp — rendered outside the ladder (plan §4).
  let loadingTenths = 0;
  if (input.concentrationLoading) {
    loadingTenths += 1;
    breakdown.push({
      label: 'Concentration loading (component > 40% of book)',
      points: 0.1,
      clause: '5.8.2',
      group: 'loading',
    });
  }
  if (input.openSet) {
    loadingTenths += 3;
    breakdown.push({
      label: 'Open counterparty set loading',
      points: 0.3,
      clause: 'D2.3',
      group: 'loading',
      coverageEffect: 'added to the compromise-coverage rate',
    });
  }

  const totalTenths = clampedTenths + loadingTenths;
  // tenths/10 = percent; percent/100 × cap ⇒ tenths/1000 × cap.
  const premiumUsd = roundCents((totalTenths * input.capUsd) / 1000);

  return {
    kind: 'quoted',
    ladderRatePct: clampedTenths / 10,
    loadingsPct: loadingTenths / 10,
    totalRatePct: totalTenths / 10,
    premiumUsd,
    breakdown,
    ceilingReached,
    flags: {
      coverageBExcluded: !input.tier2.attestation,
      kybClaimsTrap: !input.tier2.kyb,
      recoveryCoins20: !input.tier2.recovery,
      auditCoins20: !input.tier2.harnessAudit,
      hitlCoins15: !input.tier2.hitl,
      killSwitchCoins15: !input.tier2.killSwitch,
    },
  };
}

export function premiumN(premiumUsd: number, usdPerN: number): number {
  return premiumUsd / usdPerN;
}

export interface ProRataResult {
  usd: number;
  breakdown: MathBreakdown;
}

/** Remaining-term fraction of a year between two instants, floored at 0. */
function remainingYearFraction(from: Timestamp, renewalAt: Timestamp): number {
  return Math.max(0, renewalAt - from) / (YEAR_DAYS * DAY_MS);
}

/**
 * Pro-rata refund of a rate slice from a date to renewal (T5.3 logic):
 * the surcharge refunds pro rata from the VERIFICATION date (never earlier
 * than `now` — cover already consumed is not refunded), not installation.
 */
export function proRataRefund(
  points: number,
  capUsd: number,
  fromDate: Timestamp,
  renewalAt: Timestamp,
  now: Timestamp,
): ProRataResult {
  const effectiveFrom = Math.max(fromDate, now);
  const fraction = remainingYearFraction(effectiveFrom, renewalAt);
  const annualSliceUsd = (points / 100) * capUsd;
  const usd = roundCents(annualSliceUsd * fraction);
  const remainingDays = Math.max(0, renewalAt - effectiveFrom) / DAY_MS;
  return {
    usd,
    breakdown: {
      title: 'Pro-rata surcharge refund',
      inputs: [
        { label: 'Surcharge slice', amount: formatPct(points), clause: 'Appendix 3' },
        { label: 'Per-agent cap', amount: formatUsd(capUsd) },
        { label: 'Remaining term', amount: `${remainingDays.toFixed(1)} days of 365` },
      ],
      formula: `${formatPct(points)} × ${formatUsd(capUsd)} × ${remainingDays.toFixed(1)}/365 = ${formatUsd(usd)}`,
      clause: 'T5.3',
      resultUsd: usd,
    },
  };
}

export interface RepriceDeltaResult {
  deltaUsd: number;
  breakdown: MathBreakdown;
}

function quotedAnnualPremium(input: PricingInput, which: string): number {
  const priced = priceAgent(input);
  if (priced.kind === 'declined') {
    throw new Error(
      `repriceDelta: ${which} input is DECLINED (missing gates: ${priced.missingGates.join(', ')}) — mandate re-pricing requires quotable inputs`,
    );
  }
  return priced.premiumUsd;
}

/**
 * Mandate re-pricing (§9a, T5.2): annual difference pro-rated for the
 * remaining term — deltaUsd = (newAnnual − oldAnnual) × remainingDays / 365.
 */
export function repriceDelta(
  oldInput: PricingInput,
  newInput: PricingInput,
  effectiveAt: Timestamp,
  renewalAt: Timestamp,
): RepriceDeltaResult {
  const oldAnnual = quotedAnnualPremium(oldInput, 'old');
  const newAnnual = quotedAnnualPremium(newInput, 'new');
  const fraction = remainingYearFraction(effectiveAt, renewalAt);
  const deltaUsd = roundCents((newAnnual - oldAnnual) * fraction);
  const remainingDays = Math.max(0, renewalAt - effectiveAt) / DAY_MS;
  return {
    deltaUsd,
    breakdown: {
      title: 'Mandate re-pricing delta',
      inputs: [
        { label: 'New annual premium', amount: formatUsd(newAnnual) },
        { label: 'Old annual premium', amount: formatUsd(oldAnnual) },
        { label: 'Remaining term', amount: `${remainingDays.toFixed(1)} days of 365` },
      ],
      formula: `(${formatUsd(newAnnual)} − ${formatUsd(oldAnnual)}) × ${remainingDays.toFixed(1)}/365 = ${formatUsd(deltaUsd, { signed: true })}`,
      clause: 'T5.2',
      resultUsd: deltaUsd,
    },
  };
}

export type DeEnrollRefundResult =
  | { usd: number; breakdown: MathBreakdown }
  | { usd: 0; reason: 'claim paid or noticed' };

/**
 * De-enrollment refund (§9b, D7): remaining-term pro-rata of the agent's
 * annual premium from the de-enrollment timestamp — unless any claim has
 * been paid or noticed on that agent (any Claim or injected Incident
 * referencing the agent): then $0 with the reason.
 */
export function deEnrollRefund(
  enrollment: Enrollment,
  agentClaims: { claims: Claim[]; incidents: Incident[] },
  now: Timestamp,
): DeEnrollRefundResult {
  const agentIncidentIds = new Set(
    agentClaims.incidents
      .filter((i) => i.agentId === enrollment.agentId)
      .map((i) => i.id),
  );
  const noticedOrPaid =
    agentIncidentIds.size > 0 ||
    agentClaims.claims.some((c) => agentIncidentIds.has(c.incidentId));
  if (noticedOrPaid) {
    return { usd: 0, reason: 'claim paid or noticed' };
  }

  const fraction = remainingYearFraction(now, enrollment.renewalAt);
  const usd = roundCents(enrollment.premiumUsd * fraction);
  const remainingDays = Math.max(0, enrollment.renewalAt - now) / DAY_MS;
  return {
    usd,
    breakdown: {
      title: 'De-enrollment pro-rata refund',
      inputs: [
        { label: 'Annual premium', amount: formatUsd(enrollment.premiumUsd) },
        { label: 'Remaining term', amount: `${remainingDays.toFixed(1)} days of 365` },
      ],
      formula: `${formatUsd(enrollment.premiumUsd)} × ${remainingDays.toFixed(1)}/365 = ${formatUsd(usd)}`,
      clause: 'D7',
      resultUsd: usd,
    },
  };
}

export interface RenewalPreview {
  renewalRatePct: number;
  breakdown: MathBreakdown;
}

/** Renewal floor (§9c): 0.45%, in hundredths of a point. */
const RENEWAL_FLOOR_HUNDREDTHS = 45;
/** Clean-year credit: −0.05%. */
const CLEAN_YEAR_HUNDREDTHS = 5;
/** Per reported near-miss: −0.01%. */
const NEAR_MISS_HUNDREDTHS = 1;
/** No-change movement bound: ±0.15%. */
const MOVEMENT_BOUND_HUNDREDTHS = 15;

/**
 * Renewal preview (§9c, demo-defined, AC-11): clamp(currentLadderRate − 0.05
 * clean-year − 0.01 × reportedNearMisses, floor 0.45, movement ±0.15 when
 * nothing about the setup changed). Integer hundredths avoid float drift so
 * each near-miss moves the preview by exactly −0.01%.
 */
export function renewalPreview(
  currentLadderRatePct: number,
  reportedNearMisses: number,
  setupUnchanged: boolean,
): RenewalPreview {
  const cur = Math.round(currentLadderRatePct * 100);
  let candidate = cur - CLEAN_YEAR_HUNDREDTHS - NEAR_MISS_HUNDREDTHS * reportedNearMisses;
  if (setupUnchanged) {
    candidate = Math.max(cur - MOVEMENT_BOUND_HUNDREDTHS, Math.min(cur + MOVEMENT_BOUND_HUNDREDTHS, candidate));
  }
  const result = Math.max(candidate, RENEWAL_FLOOR_HUNDREDTHS);
  const renewalRatePct = result / 100;
  return {
    renewalRatePct,
    breakdown: {
      title: 'Renewal preview (demo-defined rule)',
      inputs: [
        { label: 'Current ladder rate', amount: formatPct(currentLadderRatePct) },
        { label: 'Clean-year credit', amount: '−0.05%' },
        { label: 'Near-miss credits', amount: `−0.01% × ${reportedNearMisses}` },
        ...(setupUnchanged
          ? [{ label: 'No-change guarantee', note: 'movement bounded to ±0.15%' }]
          : []),
        { label: 'Floor', amount: '0.45%' },
      ],
      formula: `clamp(${formatPct(currentLadderRatePct)} − 0.05% − 0.01% × ${reportedNearMisses}, floor 0.45%${setupUnchanged ? ', ±0.15% bound' : ''}) = ${renewalRatePct.toFixed(2)}%`,
      clause: 'demo §9c',
    },
  };
}

// Re-export the control lists for consumers that render ladders.
export { TIER1_GATES, TIER2_CONTROLS };
