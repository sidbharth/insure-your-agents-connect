/**
 * Shared WP-1 test fixtures: an all-on agent, an in-force mandate, an active
 * enrollment, and a verified operator — all with interval histories open
 * from the seed epoch, matching the seeded shape.
 */
import { createDefaultMandate, createSeedAgents, createSeedOperator, SEED_EPOCH } from '../../data/seed';
import type {
  Agent,
  AgentEventState,
  Enrollment,
  Incident,
  Mandate,
  Operator,
  ScenarioId,
} from '../../store/types';
import type { PricingInput } from '../pricing';

export const DAY_MS = 24 * 3_600_000;
export const EPOCH = SEED_EPOCH;

export function allOnInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    capUsd: 50_000,
    tier1: { hashIdentity: true, transferCaps: true, whitelist: true, actionLogging: true },
    tier2: {
      attestation: true,
      kyb: true,
      timelock: true,
      recovery: true,
      harnessAudit: true,
      hitl: true,
      killSwitch: true,
    },
    openSet: false,
    concentrationLoading: false,
    ...overrides,
  };
}

export function testAgent(overrides: Partial<Agent> = {}): Agent {
  const agent = createSeedAgents().find((a) => a.id === 'procurement-bot')!;
  return { ...agent, ...overrides };
}

/** Legacy-Bot: no attestation available (REQ-7.3.3). */
export function attestationlessAgent(): Agent {
  return createSeedAgents().find((a) => a.id === 'legacy-bot')!;
}

export function testMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    ...createDefaultMandate(),
    countersigned: { by: 'Aria Chen', at: EPOCH },
    inForceFrom: EPOCH,
    ...overrides,
  };
}

export function testEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    agentId: 'procurement-bot',
    mandateVersion: '1.0',
    rateBreakdown: [],
    loadings: [],
    premiumUsd: 300,
    settledN: 100,
    conversionRateAtPayment: 3,
    paymentPlan: 'annual',
    paymentHistory: [
      { kind: 'initial', dueAt: EPOCH, paidAt: EPOCH, amountUsd: 300, amountN: 100, rateUsed: 3 },
    ],
    effectiveAt: EPOCH,
    renewalAt: EPOCH + 365 * DAY_MS,
    credits: [],
    ...overrides,
  };
}

export function testOperator(overrides: Partial<Operator> = {}): Operator {
  return { ...createSeedOperator(), ...overrides };
}

export function eventStateFor(agent: Agent, eventAt: number): AgentEventState {
  const covers = (ivs: { from: number; to?: number }[]) =>
    ivs.some((iv) => iv.from <= eventAt && (iv.to === undefined || eventAt < iv.to));
  return {
    agent,
    tier1At: {
      hashIdentity: covers(agent.gateHistory.hashIdentity),
      transferCaps: covers(agent.gateHistory.transferCaps),
      whitelist: covers(agent.gateHistory.whitelist),
      actionLogging: covers(agent.gateHistory.actionLogging),
    },
    tier2At: {
      attestation: covers(agent.controlsHistory.attestation),
      kyb: covers(agent.controlsHistory.kyb),
      timelock: covers(agent.controlsHistory.timelock),
      recovery: covers(agent.controlsHistory.recovery),
      harnessAudit: covers(agent.controlsHistory.harnessAudit),
      hitl: covers(agent.controlsHistory.hitl),
      killSwitch: covers(agent.controlsHistory.killSwitch),
    },
    attestationOperative: covers(agent.controlsHistory.attestation),
    suspendedAt: covers(agent.suspensionHistory),
  };
}

export function testIncident(
  scenarioId: ScenarioId,
  overrides: Partial<Incident> = {},
): Incident {
  const defaults: Record<ScenarioId, Partial<Incident>> = {
    'S-03': { lossGrossUsd: 60_000, guardrailPassedVerification: true },
    'S-09': { lossGrossUsd: 20_000 },
    'S-17': { lossGrossUsd: 0, investigationCostUsd: 2_400 },
    'S-18': { lossGrossUsd: 35_000 },
    'S-24': { lossGrossUsd: 12_000 },
  };
  return {
    id: `incident-${scenarioId}`,
    scenarioId,
    agentId: 'procurement-bot',
    narrative: `Test incident ${scenarioId}`,
    discoveredAt: EPOCH + 10 * DAY_MS,
    eventAt: EPOCH + 9 * DAY_MS,
    lossGrossUsd: 0,
    lossTxRefs: [],
    containment: { frozen: [], rotated: [] },
    artifacts: {},
    ...defaults[scenarioId],
    ...overrides,
  };
}
