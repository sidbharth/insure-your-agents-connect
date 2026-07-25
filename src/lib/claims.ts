/**
 * Deterministic claim-adjudication pipeline (plan §5a, PRD §9) — WP-1.
 *
 * One pure function; coverage route and covered quantum are DERIVED, never
 * passed in. Pipeline order:
 *   1. conditions precedent at event time (conditions.ts)
 *   2. coverage eligibility + route derivation (S-09 checks attestation
 *      operative at eventAt; S-24 → model-conduct exclusion; S-03 → D;
 *      S-18 → C; S-17 → F)
 *   3. covered-loss quantum (e.g. S-03: $60,000 − $50,000 cap = $10,000)
 *   4. per-event limit (A–D 100% of cap; E 50%; F 15% w/ recovery sub-cap 10%)
 *   5. coinsurance on the governed slice only (20/15/15/20 per tier-2 at event)
 *   6. retention = max(500 × usdPerN, 0.02 × grossLoss), after coinsurance;
 *      waived for Coverage D when the guardrail passed its latest verification
 *   7. floor: payoutUsd = max(0, quantumAfterLimit − coinsurance − retention)
 */
import type {
  AdjudicationResult,
  AgentEventState,
  CoverageRoute,
  Enrollment,
  Incident,
  Mandate,
  RecoveryWaterfall,
  VerificationInterval,
} from '../store/types';
import type { BreakdownLine } from './money';
import { formatUsd } from './money';
import {
  conditionsPrecedentAt,
  enrolledAt,
  intervalCovers,
  mandateInForceAt,
  premiumCurrentAt,
  verificationCurrentAt,
} from './conditions';
import { TIER1_GATES } from '../store/types';

export interface AdjudicationInput {
  incident: Incident;
  /** From interval histories at incident.eventAt. */
  agentStateAtEvent: AgentEventState;
  mandateAtEvent: Mandate;
  enrollment: Enrollment;
  operatorHistory: VerificationInterval[];
  /** Day-of-payment rate (via payments helper). */
  usdPerN: number;
}

/** Retention floor in N (GT-7): greater of 500 N or 2% of the loss. */
export const RETENTION_FLOOR_N = 500;
export const RETENTION_LOSS_PCT = 0.02;

/** Per-event limits as a fraction of the per-agent cap (PRD 7.6). */
export function perEventLimit(route: CoverageRoute, capUsd: number): number {
  switch (route) {
    case 'A':
    case 'B':
    case 'C':
    case 'D':
      return capUsd; // 100% of the per-agent cap
    case 'E':
      return 0.5 * capUsd; // 50%
    case 'F':
      return 0.15 * capUsd; // 15% (recovery/bounty sub-cap handled separately)
  }
}

/** Recovery/bounty costs inside a Coverage-F claim are sub-capped at 10% of cap. */
export const F_RECOVERY_SUBCAP_PCT = 0.1;

/**
 * Step 4: clip the covered quantum to the per-event limit. For Coverage F the
 * recovery/bounty-cost portion is first sub-capped at 10% of the cap, then
 * the whole F quantum is capped at 15%.
 */
export function applyPerEventLimit(
  route: CoverageRoute,
  capUsd: number,
  quantumUsd: number,
  recoveryBountyCostUsd = 0,
): number {
  if (route === 'F') {
    const otherCosts = Math.max(0, quantumUsd - recoveryBountyCostUsd);
    const subCapped =
      otherCosts + Math.min(recoveryBountyCostUsd, F_RECOVERY_SUBCAP_PCT * capUsd);
    return Math.min(subCapped, perEventLimit('F', capUsd));
  }
  return Math.min(quantumUsd, perEventLimit(route, capUsd));
}

function round2(usd: number): number {
  return Math.round(usd * 100) / 100;
}

export function adjudicate(input: AdjudicationInput): AdjudicationResult {
  const { incident, agentStateAtEvent, mandateAtEvent, enrollment, operatorHistory, usdPerN } =
    input;
  const t = incident.eventAt;
  const agent = agentStateAtEvent.agent;

  // -- 1. Conditions precedent at event time (GT-2) -------------------------
  const conditionState = {
    gatesOperative: TIER1_GATES.every((g) => intervalCovers(agent.gateHistory[g], t)),
    mandateInForce: mandateInForceAt([mandateAtEvent], t),
    premiumCurrent: premiumCurrentAt(enrollment, t),
    verificationCurrent: verificationCurrentAt(operatorHistory, t),
    suspended: intervalCovers(agent.suspensionHistory, t),
    enrolled: enrolledAt(enrollment, t),
  };
  const conditionsPrecedent = conditionsPrecedentAt(conditionState);
  if (!conditionsPrecedent.pass) {
    return {
      conditionsPrecedent,
      eligibility: {
        covered: false,
        reason: `Not payable. Condition precedent: ${conditionsPrecedent.failedCondition}`,
        clause: 'T3.1–T3.4',
      },
    };
  }

  // -- 2. Coverage eligibility + route derivation ---------------------------
  let route: CoverageRoute;
  let eligibilityReason: string;
  let eligibilityClause: string;
  switch (incident.scenarioId) {
    case 'S-03':
      route = 'D';
      eligibilityReason =
        'Covered under D: a deterministic guardrail (the cap module) failed to fire.';
      eligibilityClause = 'Coverage D';
      break;
    case 'S-09':
      if (!agentStateAtEvent.attestationOperative) {
        return {
          conditionsPrecedent,
          eligibility: {
            covered: false,
            route: 'B',
            reason: 'unprovable without attested input and output records, so Coverage B is excluded',
            clause: 'D3.5',
          },
        };
      }
      route = 'B';
      eligibilityReason =
        'Covered under B: attested input/output records prove the injected content.';
      eligibilityClause = 'Coverage B';
      break;
    case 'S-17':
      route = 'F';
      eligibilityReason =
        'Covered under F: near-miss investigation and response costs.';
      eligibilityClause = 'Coverage F';
      break;
    case 'S-18':
      route = 'C';
      eligibilityReason =
        'Covered under C: signing credentials inside the disclosed setup were stolen.';
      eligibilityClause = 'Coverage C';
      break;
    case 'S-24':
      return {
        conditionsPrecedent,
        eligibility: {
          covered: false,
          reason:
            'Not covered: model conduct. No adversarial content in the attested inputs: the model was simply wrong. Had the attested inputs shown crafted adversarial content, this would have been Coverage B.',
          clause: '4.9',
        },
      };
  }

  // -- 3. Covered-loss quantum ----------------------------------------------
  const grossLossUsd = incident.lossGrossUsd;
  const capUsd = mandateAtEvent.caps.perTx;
  let coveredQuantumUsd: number;
  const quantumLines: BreakdownLine[] = [];
  switch (incident.scenarioId) {
    case 'S-03':
      // D pays the slice the guardrail would have stopped: the excess over the cap.
      coveredQuantumUsd = Math.max(0, grossLossUsd - capUsd);
      quantumLines.push({
        label: 'Covered quantum (excess over the mandate cap)',
        amount: `${formatUsd(grossLossUsd)} − ${formatUsd(capUsd)} = ${formatUsd(coveredQuantumUsd)}`,
        clause: 'Coverage D',
      });
      break;
    case 'S-17':
      coveredQuantumUsd = incident.investigationCostUsd ?? 0;
      quantumLines.push({
        label: 'Covered quantum (investigation costs)',
        amount: formatUsd(coveredQuantumUsd),
        clause: 'Coverage F',
      });
      break;
    default:
      coveredQuantumUsd = grossLossUsd;
      quantumLines.push({
        label: 'Covered quantum (net asset loss)',
        amount: formatUsd(coveredQuantumUsd),
        clause: eligibilityClause,
      });
  }

  // -- 4. Per-event limit ----------------------------------------------------
  const perEventLimitUsd = perEventLimit(route, capUsd);
  const quantumAfterLimitUsd = applyPerEventLimit(route, capUsd, coveredQuantumUsd);

  // -- 5. Coinsurance on the governed slice only (5.5), tier-2 at event time -
  const tier2 = agentStateAtEvent.tier2At;
  let coinsuranceUsd = 0;
  const coinsuranceLines: BreakdownLine[] = [];
  if (!tier2.recovery && (incident.recoverableUsd ?? 0) > 0) {
    const slice = 0.2 * (incident.recoverableUsd ?? 0);
    coinsuranceUsd += slice;
    coinsuranceLines.push({
      label: 'Coinsurance: 20% of the recovery-recoverable slice (no recovery mechanism)',
      amount: formatUsd(slice),
      clause: '5.5',
    });
  }
  if (!tier2.hitl) {
    const governed = Math.max(0, quantumAfterLimitUsd - mandateAtEvent.hitl.threshold);
    if (governed > 0) {
      const slice = 0.15 * governed;
      coinsuranceUsd += slice;
      coinsuranceLines.push({
        label: 'Coinsurance: 15% of the above-HITL-threshold slice (no human approval gate)',
        amount: formatUsd(slice),
        clause: '5.5',
      });
    }
  }
  if (!tier2.killSwitch && (incident.postFirstAlertLossUsd ?? 0) > 0) {
    const slice = 0.15 * (incident.postFirstAlertLossUsd ?? 0);
    coinsuranceUsd += slice;
    coinsuranceLines.push({
      label: 'Coinsurance: 15% of the post-first-alert slice (no kill switch + monitoring)',
      amount: formatUsd(slice),
      clause: '5.5',
    });
  }
  if (!tier2.harnessAudit && route === 'D') {
    const slice = 0.2 * quantumAfterLimitUsd;
    coinsuranceUsd += slice;
    coinsuranceLines.push({
      label: 'Coinsurance: 20% Coverage-D coinsurance (unaudited harness, until first audit)',
      amount: formatUsd(slice),
      clause: '5.5, D3.2',
    });
  }
  coinsuranceUsd = round2(coinsuranceUsd);

  // -- 6. Retention (after coinsurance) ---------------------------------------
  // greater of 500 N or 2% of the gross loss (GT-7). Waived for Coverage D
  // when the failed guardrail passed its latest scheduled verification (5.3).
  // A pure near-miss (no net asset loss) bears no retention: Coverage F is
  // responding to costs, not a loss event.
  const isNearMiss = incident.scenarioId === 'S-17' && grossLossUsd === 0;
  const retentionWaived =
    (route === 'D' && incident.guardrailPassedVerification === true) || isNearMiss;
  const retentionBaseUsd = round2(
    Math.max(RETENTION_FLOOR_N * usdPerN, RETENTION_LOSS_PCT * grossLossUsd),
  );
  const retentionUsd = retentionWaived ? 0 : retentionBaseUsd;

  // -- 7. Floor ----------------------------------------------------------------
  const payoutUsd = round2(Math.max(0, quantumAfterLimitUsd - coinsuranceUsd - retentionUsd));
  const payoutN = payoutUsd / usdPerN;

  return {
    conditionsPrecedent,
    eligibility: { covered: true, route, reason: eligibilityReason, clause: eligibilityClause },
    math: {
      grossLossUsd,
      coveredQuantumUsd,
      perEventLimitUsd,
      quantumAfterLimitUsd,
      coinsuranceUsd,
      retentionUsd,
      retentionWaived,
      payoutUsd,
      payoutN,
      rateUsed: usdPerN,
      breakdown: {
        title: 'Claim payout',
        inputs: [
          { label: 'Gross loss', amount: formatUsd(grossLossUsd) },
          { label: 'Per-agent cap', amount: formatUsd(capUsd) },
          { label: 'Rate used (day of payment)', amount: `1 $NEAR = $${usdPerN.toFixed(2)}` },
        ],
        formula: `max(0, ${formatUsd(quantumAfterLimitUsd)} − ${formatUsd(coinsuranceUsd)} − ${formatUsd(retentionUsd)}) = ${formatUsd(payoutUsd)}`,
        clause: '5.6',
        lines: [
          ...quantumLines,
          {
            label: `Per-event limit (route ${route})`,
            amount: `${formatUsd(perEventLimitUsd)} → quantum after limit ${formatUsd(quantumAfterLimitUsd)}`,
            clause: '7.6 limits',
          },
          ...(coinsuranceLines.length > 0
            ? coinsuranceLines
            : [{ label: 'Coinsurance', amount: '$0', clause: '5.5', note: 'no skipped tier-2 control governs this loss' }]),
          {
            label: 'Retention',
            amount: retentionWaived ? '$0 (waived)' : formatUsd(retentionUsd),
            clause: '5.3',
            note: retentionWaived
              ? isNearMiss
                ? 'near-miss (no net asset loss to retain against)'
                : 'waived (the guardrail passed its latest scheduled verification)'
              : `greater of 500 $NEAR (${formatUsd(round2(RETENTION_FLOOR_N * usdPerN))}) or 2% of the loss (${formatUsd(round2(RETENTION_LOSS_PCT * grossLossUsd))})`,
          },
          {
            label: 'Payout',
            amount: `${formatUsd(payoutUsd)} ≈ ${payoutN.toFixed(1)} $NEAR at the day-of-payment rate`,
            clause: '5.6',
          },
        ],
        resultUsd: payoutUsd,
        rateUsed: usdPerN,
      },
    },
  };
}

/**
 * Recovery waterfall: recovered funds repay the insurer first, then the
 * insured's retained slice, then any uninsured loss (S-18: $10,000 → all to
 * the insurer).
 */
export function recoveryWaterfall(
  recoveredUsd: number,
  insurerPaidUsd: number,
  insuredRetainedUsd: number,
): RecoveryWaterfall {
  const toInsurerUsd = Math.min(recoveredUsd, insurerPaidUsd);
  const afterInsurer = recoveredUsd - toInsurerUsd;
  const toInsuredRetainedUsd = Math.min(afterInsurer, insuredRetainedUsd);
  const toUninsuredUsd = afterInsurer - toInsuredRetainedUsd;
  return { recoveredUsd, toInsurerUsd, toInsuredRetainedUsd, toUninsuredUsd };
}
