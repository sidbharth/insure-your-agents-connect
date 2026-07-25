/**
 * WP-3 purchase helpers: enrollment orchestration for Quote / Fleet / Pay
 * (screens 7.6–7.8). Uses ONLY frozen contracts:
 *   - lib/concentration.enroll() decides the +0.1% loading ATOMICALLY on the
 *     prospective post-enrollment book (plan §4b, REQ-7.7.2, AC-6);
 *   - lib/pricing.priceAgent() produces every rate/premium (no money math in
 *     the UI, REQ-7.7.1/AC-5: the fleet total is the plain sum);
 *   - session-slice actions commit the results.
 * Once enrolled, the rateBreakdown/loadings are FROZEN on the enrollment —
 * a later book drop never changes existing rates; only enrollments made
 * after the drop are re-decided (REQ-7.7.2).
 */
import {
  createDefaultMandate,
  FLEET_IMPORT_ORDER,
  SEED_CAP_USD,
  WIZARD_AGENT,
  type SeedAgentSpec,
} from '../../data/seed';
import { YEAR_MS } from '../../lib/clocks';
import { enroll as bookEnroll } from '../../lib/concentration';
import { verificationCurrentAt } from '../../lib/conditions';
import { demoNow } from '../../lib/demoClock';
import { configHash } from '../../lib/hash';
import { priceAgent, type PricingInput } from '../../lib/pricing';
import { useStore } from '../../store';
import type {
  Agent,
  Enrollment,
  Mandate,
  RootState,
  Tier1Gate,
  Tier2Control,
} from '../../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../../store/types';
import { newestMandate } from '../portfolio/helpers';

export { YEAR_MS };

/** Book-component key for an agent — matches the seeded book's harness keys. */
export function componentKey(agent: Agent): string {
  return `${agent.harness.name} ${agent.harness.version}`;
}

/** Latest mandate version for an agent, if any. */
export function latestMandate(state: RootState, agentId: string): Mandate | undefined {
  return newestMandate(state.mandates[agentId]);
}

/** Premium base = the mandate's per-transaction cap (GT-3). */
export function capUsdFor(state: RootState, agentId: string): number {
  return latestMandate(state, agentId)?.caps.perTx ?? SEED_CAP_USD;
}

/**
 * Build the frozen pricing input from live agent + mandate state. The KYB
 * tier-2 control mirrors the operator's verification interval at demo-now
 * (same semantics as the wizard's buildPricingInput, plan §8/7.5): an
 * unverified operator prices as KYB-skipped (+0.4%) no matter the agent flag.
 */
export function pricingInputFor(
  state: RootState,
  agent: Agent,
  mandate: Mandate | undefined,
  concentrationLoading: boolean,
): PricingInput {
  const operatorVerified = verificationCurrentAt(
    state.operator.verificationHistory,
    demoNow(),
  );
  return {
    capUsd: mandate?.caps.perTx ?? SEED_CAP_USD,
    tier1: { ...agent.controls.tier1 },
    tier2: {
      ...agent.controls.tier2,
      kyb: agent.controls.tier2.kyb && operatorVerified,
    },
    openSet: mandate?.whitelist.openSet ?? false,
    concentrationLoading,
  };
}

/** Live (non-terminated) enrollments, in enrollment order. */
export function activeEnrollments(state: RootState): Enrollment[] {
  return state.enrollments.filter((e) => e.terminatedAt === undefined);
}

/** Latest enrollment per agent (terminated ones included → De-enrolled rows). */
export function latestEnrollmentsByAgent(state: RootState): Enrollment[] {
  const byAgent = new Map<string, Enrollment>();
  for (const e of state.enrollments) byAgent.set(e.agentId, e);
  return [...byAgent.values()];
}

/** Join enrollments to their agents, dropping any without a matching agent. */
export function enrollmentAgentRows(
  enrollments: Enrollment[],
  agents: Agent[],
): { enrollment: Enrollment; agent: Agent }[] {
  return enrollments
    .map((e) => ({ enrollment: e, agent: agents.find((a) => a.id === e.agentId) }))
    .filter(
      (r): r is { enrollment: Enrollment; agent: Agent } => r.agent !== undefined,
    );
}

export interface FleetTotals {
  count: number;
  capsUsd: number;
  premiumUsd: number;
}

/**
 * The fleet premium is the EXACT SUM of per-agent premiums — no discount
 * logic exists anywhere (REQ-7.7.1, AC-5).
 */
export function fleetTotals(state: RootState): FleetTotals {
  const live = activeEnrollments(state);
  return {
    count: live.length,
    capsUsd: live.reduce((sum, e) => sum + capUsdFor(state, e.agentId), 0),
    premiumUsd: live.reduce((sum, e) => sum + e.premiumUsd, 0),
  };
}

/** Total rate on an enrollment = sum of its frozen ladder + loading lines. */
export function enrollmentRatePct(e: Enrollment): number {
  const tenths = [...e.rateBreakdown, ...e.loadings].reduce(
    (sum, l) => sum + Math.round(l.points * 10),
    0,
  );
  return tenths / 10;
}

export function hasConcentrationLoading(e: Enrollment): boolean {
  return e.loadings.some((l) => l.label.toLowerCase().includes('concentration'));
}

export function coverageBExcluded(e: Enrollment): boolean {
  return e.rateBreakdown.some((l) => l.coverageEffect === 'Coverage B excluded');
}

/** "All 11 controls" / "No attestation" / "9 of 11 controls". */
export function controlsSummary(agent: Agent): string {
  const off: string[] = [
    ...TIER1_GATES.filter((g: Tier1Gate) => !agent.controls.tier1[g]),
    ...TIER2_CONTROLS.filter((c: Tier2Control) => !agent.controls.tier2[c]),
  ];
  const total = TIER1_GATES.length + TIER2_CONTROLS.length;
  if (off.length === 0) return `All ${total} controls`;
  if (off.length === 1 && off[0] === 'attestation') return 'No attestation';
  return `${total - off.length} of ${total} controls`;
}

export type EnrollOutcome =
  | { ok: true; loadingApplied: boolean; alreadyEnrolled?: boolean }
  | { ok: false; declined?: string[] };

/**
 * Enroll one agent: decide the concentration loading atomically on the
 * prospective book (lib/concentration.enroll), price with the decision
 * frozen in, commit book + enrollment, flip status to Quoted.
 */
export function enrollAgent(agentId: string): EnrollOutcome {
  const s = useStore.getState();
  const agent = s.agents.find((a) => a.id === agentId);
  if (!agent) return { ok: false };
  if (s.enrollments.some((e) => e.agentId === agentId && e.terminatedAt === undefined)) {
    return { ok: true, loadingApplied: false, alreadyEnrolled: true };
  }

  const mandate = latestMandate(s, agentId);
  const capUsd = mandate?.caps.perTx ?? SEED_CAP_USD;
  const component = componentKey(agent);

  // Atomic prospective-book decision (plan §4b): the loading is decided as if
  // this enrollment were already on the book, then the book commits.
  const decision = bookEnroll(s.book, component, capUsd);
  const priced = priceAgent(pricingInputFor(s, agent, mandate, decision.loadingApplied));

  if (priced.kind === 'declined') {
    s.setAgentStatus(agentId, 'Declined');
    return { ok: false, declined: priced.missingGates };
  }

  s.commitBookEnrollment(component, capUsd);
  const now = demoNow();
  s.addEnrollment({
    agentId,
    mandateVersion: mandate?.version ?? '1.0',
    rateBreakdown: priced.breakdown.filter((l) => l.group === 'ladder'),
    loadings: priced.breakdown.filter((l) => l.group === 'loading'),
    premiumUsd: priced.premiumUsd,
    settledN: priced.premiumUsd / s.priceFeed.usdPerN,
    conversionRateAtPayment: 0, // stamped by activateEnrollments at payment (AC-7)
    paymentPlan: 'annual',
    paymentHistory: [],
    effectiveAt: 0, // stamped by activateEnrollments at payment (AC-7)
    // Provisional renewal estimate for pre-payment previews (e.g. the Fleet
    // de-enroll pro-rata refund, REQ-7.7.4); re-anchored to effectiveAt +
    // 1yr by activateEnrollments once payment lands (AC-7).
    renewalAt: now + YEAR_MS,
    credits: [],
  });
  s.setAgentStatus(agentId, 'Quoted');
  return { ok: true, loadingApplied: decision.loadingApplied };
}

/**
 * Simulated CSV-import prep for a seeded agent: the sweep registers the
 * countersigned default mandate and completes the ownership challenge
 * (everything simulated except the N price, REQ-6.5).
 */
export function prepareImportedAgent(agentId: string): void {
  const s = useStore.getState();
  if (!(s.mandates[agentId]?.length)) {
    s.saveMandate(agentId, createDefaultMandate());
  }
  const versions = useStore.getState().mandates[agentId] ?? [];
  if (versions.length > 0 && !versions[versions.length - 1].countersigned) {
    s.countersignMandate(agentId);
  }
  const agent = s.agents.find((a) => a.id === agentId);
  if (agent && !agent.ownershipVerified) {
    s.markOwnershipVerified(agentId);
  }
}

/** Seeded agents the CSV import still has to bring in, in the FIXED order. */
export function remainingImportSpecs(state: RootState): SeedAgentSpec[] {
  return FLEET_IMPORT_ORDER.filter((spec) => {
    const agent = state.agents.find((a) => a.id === spec.id);
    return agent !== undefined && agent.status === 'Draft';
  });
}

/** Duplicate the wizard agent's configuration as a new Draft + enroll it. */
export function duplicateWizardAgent(): string | undefined {
  const s = useStore.getState();
  const src = s.agents.find((a) => a.id === WIZARD_AGENT.id);
  if (!src) return undefined;
  const n = s.agents.filter((a) => a.id.startsWith(`${WIZARD_AGENT.id}-copy-`)).length + 1;
  const id = `${WIZARD_AGENT.id}-copy-${n}`;
  const name = `${src.name} (copy ${n})`;
  const clone: Agent = {
    ...(JSON.parse(JSON.stringify(src)) as Agent),
    id,
    name,
    configHash: configHash(`${name}|${componentKey(src)}|manifest-v1`),
    ownershipVerified: false,
    status: 'Draft',
  };
  s.registerAgent(clone);
  const srcMandate = latestMandate(s, WIZARD_AGENT.id) ?? createDefaultMandate();
  s.saveMandate(id, { ...(JSON.parse(JSON.stringify(srcMandate)) as Mandate), countersigned: undefined, inForceFrom: undefined, inForceTo: undefined });
  prepareImportedAgent(id);
  enrollAgent(id);
  return id;
}
