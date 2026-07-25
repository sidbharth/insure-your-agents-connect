/**
 * Presenter incident injections S-03 / S-09 / S-17 / S-18 / S-24 (plan §5d,
 * REQ-7.12.1, AC-9) — WP-5 owned.
 *
 * - `EVIDENCE_MATRIX` is the exact per-scenario applicability table from plan
 *   §5d: items 1–5, 10, 11, 12 are general; 6 is Coverage-B-specific, 7 is
 *   C-specific, 8 is D-specific, 9 is E-specific. Every scenario auto-attaches
 *   exactly six applicable items; `notApplicable` items are greyed and count
 *   toward NEITHER the ≥6 auto minimum NOR package completeness.
 * - `buildIncident` produces the full Incident with narrative, demo-clock
 *   timestamps, containment record, and pre-built mock artifacts for every
 *   applicable item, so the claim screen's auto-attachment promise holds.
 * - `buildAdjudicationInput` reconstructs agent/mandate/enrollment state at
 *   the incident's event time from the store's interval histories, so
 *   adjudication is always recomputed, never snapshotted (plan §5b, AC-13).
 */
import { intervalCovers } from '../lib/conditions';
import { demoNow } from '../lib/demoClock';
import { formatUsd } from '../lib/money';
import type { AdjudicationInput } from '../lib/claims';
import type {
  Agent,
  AgentEventState,
  Enrollment,
  EvidenceItem,
  EvidenceStatus,
  Incident,
  Mandate,
  MockArtifact,
  Operator,
  RootState,
  ScenarioId,
  Timestamp,
} from '../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../store/types';
import { EVIDENCE_ITEM_LABELS } from './copy';
import { createDefaultMandate, SEED_INCIDENT_PARAMS } from './seed';

const MIN_MS = 60_000;

// ---------------------------------------------------------------------------
// Scenario metadata (presenter panel buttons + defaults)
// ---------------------------------------------------------------------------

export interface ScenarioMeta {
  scenarioId: ScenarioId;
  title: string;
  /** One-line description for the presenter panel button. */
  presenterLine: string;
  defaultLossUsd: number;
  investigationCostUsd?: number;
  /** S-18: scripted later recovery, fed to the waterfall card. */
  scriptedRecoveryUsd?: number;
  guardrailPassedVerification?: boolean;
  nearMiss: boolean;
}

export const SCENARIOS: Record<ScenarioId, ScenarioMeta> = {
  'S-03': {
    scenarioId: 'S-03',
    title: 'Cap-module failure',
    presenterLine: 'D-claim · retention-waiver demonstration',
    defaultLossUsd: SEED_INCIDENT_PARAMS['S-03'].lossGrossUsd,
    guardrailPassedVerification: true,
    nearMiss: false,
  },
  'S-09': {
    scenarioId: 'S-09',
    title: 'Prompt injection',
    presenterLine: 'B-claim · resolves excluded if target lacks attestation',
    defaultLossUsd: SEED_INCIDENT_PARAMS['S-09'].lossGrossUsd,
    nearMiss: false,
  },
  'S-17': {
    scenarioId: 'S-17',
    title: 'Blocked injection',
    presenterLine: 'near-miss → F costs + feed entry',
    defaultLossUsd: 0,
    investigationCostUsd: SEED_INCIDENT_PARAMS['S-17'].investigationCostUsd,
    nearMiss: true,
  },
  'S-18': {
    scenarioId: 'S-18',
    title: 'Key exfiltration',
    presenterLine: 'C-claim · scripted $10,000 recovery',
    defaultLossUsd: SEED_INCIDENT_PARAMS['S-18'].lossGrossUsd,
    scriptedRecoveryUsd: SEED_INCIDENT_PARAMS['S-18'].scriptedRecoveryUsd,
    nearMiss: false,
  },
  'S-24': {
    scenarioId: 'S-24',
    title: 'Hallucinated invoice',
    presenterLine: 'the model-conduct denial',
    defaultLossUsd: SEED_INCIDENT_PARAMS['S-24'].lossGrossUsd,
    nearMiss: false,
  },
};

export const SCENARIO_IDS: readonly ScenarioId[] = [
  'S-03',
  'S-09',
  'S-17',
  'S-18',
  'S-24',
] as const;

// ---------------------------------------------------------------------------
// Evidence applicability matrix (plan §5d — EXACT table)
// ---------------------------------------------------------------------------

export interface EvidenceApplicability {
  /** Exactly six auto-attached applicable items per scenario (AC-9). */
  auto: readonly number[];
  /** One-click simulated uploads. */
  upload: readonly number[];
  /** Greyed "not applicable to this claim"; never gates completeness. */
  notApplicable: readonly number[];
}

export const EVIDENCE_MATRIX: Record<ScenarioId, EvidenceApplicability> = {
  'S-03': { auto: [2, 3, 4, 8, 10, 11], upload: [1, 5, 12], notApplicable: [6, 7, 9] },
  'S-09': { auto: [2, 3, 4, 6, 10, 11], upload: [1, 5, 12], notApplicable: [7, 8, 9] },
  'S-17': { auto: [2, 3, 4, 6, 10, 11], upload: [1, 12], notApplicable: [5, 7, 8, 9] },
  'S-18': { auto: [2, 3, 4, 7, 10, 11], upload: [1, 5, 12], notApplicable: [6, 8, 9] },
  'S-24': { auto: [2, 3, 4, 6, 10, 11], upload: [1, 5, 12], notApplicable: [7, 8, 9] },
};

export const NOT_APPLICABLE_SOURCE = 'not applicable to this claim';
export const AUTO_ATTACHED_SOURCE = 'auto-attached from your records';

/** Appendix 2 source column, per item. */
export const EVIDENCE_ITEM_SOURCES: Record<number, string> = {
  1: 'Operator',
  2: 'Enrolment record',
  3: 'Attestation endpoint',
  4: 'Append-only log',
  5: 'Chain/forensic partner',
  6: 'TEE logs',
  7: 'Operator KMS',
  8: 'Guardrail Schedule + logs',
  9: 'Counterparty/court',
  10: 'Operator',
  11: 'Schedule venues',
  12: 'Operator + Insurer panel',
};

/** Per-scenario label refinements for the route-specific items (plan §5d). */
const LABEL_OVERRIDES: Partial<Record<ScenarioId, Record<number, string>>> = {
  'S-09': {
    6: 'Attested input/output records showing the injected content (Coverage B)',
  },
  'S-17': {
    6: 'Attested record of the blocked injection (Coverage B)',
    11: 'Investigation-cost record (valuation inputs)',
  },
  'S-18': {
    7: 'Credential access logs + rotation evidence (Coverage C)',
  },
  'S-24': {
    6: 'Attested input/output records showing no adversarial content — the proof of the denial',
  },
};

export function evidenceLabel(scenarioId: ScenarioId, itemId: number): string {
  return LABEL_OVERRIDES[scenarioId]?.[itemId] ?? EVIDENCE_ITEM_LABELS[itemId];
}

/**
 * The 12-item checklist for a scenario: auto items pre-stamped, uploadables
 * start `missing`, non-applicable items greyed (plan §5d, AC-9).
 */
export function buildEvidenceChecklist(scenarioId: ScenarioId): EvidenceItem[] {
  const matrix = EVIDENCE_MATRIX[scenarioId];
  return Array.from({ length: 12 }, (_, i) => {
    const id = i + 1;
    let status: EvidenceStatus;
    let source: string;
    if (matrix.auto.includes(id)) {
      status = 'auto';
      source = AUTO_ATTACHED_SOURCE;
    } else if (matrix.upload.includes(id)) {
      status = 'missing';
      source = EVIDENCE_ITEM_SOURCES[id];
    } else {
      status = 'notApplicable';
      source = NOT_APPLICABLE_SOURCE;
    }
    return { id, label: evidenceLabel(scenarioId, id), status, source };
  });
}

/** Applicable = everything not `notApplicable` (drives the progress ring). */
export function applicableItems(evidence: EvidenceItem[]): EvidenceItem[] {
  return evidence.filter((e) => e.status !== 'notApplicable');
}

export function attachedItems(evidence: EvidenceItem[]): EvidenceItem[] {
  return evidence.filter((e) => e.status === 'auto' || e.status === 'uploaded');
}

/**
 * A package is complete when every APPLICABLE item is attached.
 * `notApplicable` items never gate `packageCompleteAt` (plan §5c/§5d, AC-9).
 */
export function packageComplete(evidence: EvidenceItem[]): boolean {
  return applicableItems(evidence).every(
    (e) => e.status === 'auto' || e.status === 'uploaded',
  );
}

// ---------------------------------------------------------------------------
// Narratives + artifacts
// ---------------------------------------------------------------------------

function narrativeFor(scenarioId: ScenarioId, agent: Agent, lossUsd: number): string {
  const loss = formatUsd(lossUsd);
  switch (scenarioId) {
    case 'S-03':
      return `${agent.name} initiated a ${loss} transfer against the $50,000 per-transaction cap. The deterministic cap module (a scheduled guardrail that passed its latest quarterly verification) failed to fire on stale configuration, and the excess left before any hold could attach. The kill switch was activated on the first anomaly alert.`;
    case 'S-09':
      return `${agent.name} paid ${loss} to an unfamiliar address after processing a supplier catalogue page. The payee was on the whitelist via a spoofed resolvable name; the transfer was under cap and in-mandate. Anomaly monitoring flagged the pattern within minutes; the kill switch was fired immediately after.`;
    case 'S-17':
      return `${agent.name}'s input filter caught a crafted instruction embedded in an inbound invoice attachment and refused the tool call. No value moved. The attempt was investigated, the source blocked, and the incident is reported as a near-miss under Coverage F (investigation and response costs).`;
    case 'S-18':
      return `Session signing credentials for ${agent.name} were exfiltrated from the disclosed key map and used to move ${loss} without the agent or the Principal initiating anything. The kill switch was fired on the first alert, the affected whitelist entries frozen, and every implicated credential rotated. Tracing is under way.`;
    case 'S-24':
      return `${agent.name} paid a ${loss} invoice for goods that were never ordered and do not exist. The attested inputs show no adversarial content, no compromised tool, and no spoofed instruction channel. The payee is real and whitelisted, the amount under cap. The invoice was a fabrication of the model itself.`;
  }
}

function artifactFor(
  scenarioId: ScenarioId,
  itemId: number,
  agent: Agent,
  lossUsd: number,
  eventAt: Timestamp,
): MockArtifact {
  const t = new Date(eventAt).toISOString();
  const loss = formatUsd(lossUsd);
  const generic: Record<number, MockArtifact> = {
    1: {
      kind: 'notification',
      title: 'Signed loss notification',
      body: `Signed incident narrative and discovery timeline for ${agent.name}, event ${t}. Simulated operator signature.`,
    },
    2: {
      kind: 'record',
      title: 'Countersigned mandate version in force',
      body: `Mandate v1.0 for ${agent.name}, countersigned by Aria Chen, in force at event time ${t}.`,
    },
    3: {
      kind: 'attestation',
      title: 'Configuration hash + attestation chain',
      body: `Registered configuration hash ${agent.configHash} with the attestation chain covering the event window around ${t}.`,
    },
    4: {
      kind: 'log',
      title: 'Action-log extract',
      body: `Append-only action-log extract for ${agent.name}: all events from 24h before the first loss transaction through containment.`,
    },
    5: {
      kind: 'report',
      title: 'Chain data + tracing report',
      body: `Transaction hashes, receiving addresses, and the forensic partner's tracing report for the ${loss} outflow.`,
    },
    10: {
      kind: 'record',
      title: 'Containment record',
      body: `Kill-switch timestamp, whitelist freezes, and credential rotations for the ${scenarioId} event (T7.2/T7.3).`,
    },
    11: {
      kind: 'valuation',
      title: 'Valuation inputs',
      body: `Reference-venue prices for the 4-hour window before the first loss transaction (5.6).`,
    },
    12: {
      kind: 'record',
      title: 'Recovery actions record',
      body: `Recovery actions taken and outstanding (T7.4), maintained with the insurer's panel.`,
    },
  };
  const specific: Partial<Record<ScenarioId, Record<number, MockArtifact>>> = {
    'S-03': {
      8: {
        kind: 'guardrail',
        title: 'Guardrail spec + verification history + failing log line',
        body: `Cap-module specification, its passed quarterly verification history, and the log line showing the module's non-operation at ${t}.`,
      },
    },
    'S-09': {
      6: {
        kind: 'tee-log',
        title: 'Attested I/O showing the injected content',
        body: `TEE-attested input/output records for the session: the poisoned supplier catalogue page carrying the crafted instruction, and the resulting tool call.`,
      },
    },
    'S-17': {
      6: {
        kind: 'tee-log',
        title: 'Attested record of the blocked injection',
        body: `TEE-attested record of the crafted instruction and the input filter's refusal — no tool call was made, no value moved.`,
      },
      11: {
        kind: 'valuation',
        title: 'Investigation-cost record',
        body: `Itemised investigation and response costs (${formatUsd(SCENARIOS['S-17'].investigationCostUsd ?? 0)}) claimed under Coverage F.`,
      },
    },
    'S-18': {
      7: {
        kind: 'kms-log',
        title: 'Credential access logs + rotation evidence',
        body: `Operator KMS credential inventory delta, access logs for the exfiltrated session keys, and rotation evidence for every implicated credential.`,
      },
    },
    'S-24': {
      6: {
        kind: 'tee-log',
        title: 'Attested I/O showing no adversarial content',
        body: `TEE-attested input/output records for the session: clean inputs, no injected content, no compromised tool, no spoofed channel. The proof that the model was simply wrong.`,
      },
    },
  };
  return specific[scenarioId]?.[itemId] ?? generic[itemId];
}

/**
 * Pre-built mock artifacts for every APPLICABLE item (auto + uploadable),
 * and none for notApplicable items — no fabricated route-specific evidence
 * (REQ-7.12.1, AC-9).
 */
export function buildArtifacts(
  scenarioId: ScenarioId,
  agent: Agent,
  lossUsd: number,
  eventAt: Timestamp,
): Record<number, MockArtifact> {
  const matrix = EVIDENCE_MATRIX[scenarioId];
  const artifacts: Record<number, MockArtifact> = {};
  for (const id of [...matrix.auto, ...matrix.upload]) {
    artifacts[id] = artifactFor(scenarioId, id, agent, lossUsd, eventAt);
  }
  return artifacts;
}

// ---------------------------------------------------------------------------
// Incident builder
// ---------------------------------------------------------------------------

let incidentCounter = 0;

/** Test hook: deterministic incident ids from a fresh module state. */
export function resetIncidentCounter(): void {
  incidentCounter = 0;
}

/** Restore hook: advance the counter past ids present in a saved session. */
export function bumpIncidentCounterTo(n: number): void {
  incidentCounter = Math.max(incidentCounter, n);
}

/**
 * Build the full Incident for a presenter injection. `eventAt` and
 * `discoveredAt` are stamped at the demo clock's NOW, so the event is always
 * adjudicated against the world's current interval state — revoke-then-inject
 * lands the event inside the unverified interval (AC-13).
 */
export function buildIncident(
  scenarioId: ScenarioId,
  agent: Agent,
  lossUsd?: number,
  at: Timestamp = demoNow(),
): Incident {
  const meta = SCENARIOS[scenarioId];
  const lossGrossUsd = lossUsd ?? meta.defaultLossUsd;
  const eventAt = at;
  const discoveredAt = at;
  return {
    id: `inc-${scenarioId.toLowerCase()}-${++incidentCounter}`,
    scenarioId,
    agentId: agent.id,
    narrative: narrativeFor(scenarioId, agent, lossGrossUsd),
    discoveredAt,
    eventAt,
    lossGrossUsd,
    lossTxRefs:
      lossGrossUsd > 0 ? [`0x${(0x8c4e1b77 + incidentCounter).toString(16)}…${scenarioId.slice(-2)}`] : [],
    containment: {
      killSwitchAt: discoveredAt + 2 * MIN_MS,
      frozen:
        scenarioId === 'S-17' || scenarioId === 'S-24'
          ? []
          : ['Spoofed resolvable-name entry and its address'],
      rotated:
        scenarioId === 'S-17'
          ? []
          : ['Session keys used in the loss transaction'],
    },
    artifacts: buildArtifacts(scenarioId, agent, lossGrossUsd, eventAt),
    investigationCostUsd: meta.investigationCostUsd,
    guardrailPassedVerification: meta.guardrailPassedVerification,
  };
}

// ---------------------------------------------------------------------------
// Incident landing + claim opening (shared by the presenter panel's
// injectIncident action and the self-serve claim demo)
// ---------------------------------------------------------------------------

/**
 * Build an incident and land it on the fleet: add it to the claims slice and,
 * for S-17, record the near-miss feed entry + renewal data credit
 * (REQ-7.9.3, AC-11). Arming the dashboard "Simulate incident" affordance is
 * presenter-only and deliberately NOT done here, so the self-serve claim demo
 * never leaks presenter chrome.
 */
export function landIncident(
  state: Pick<RootState, 'agents' | 'addIncident' | 'addNearMiss' | 'addCredit'>,
  scenarioId: ScenarioId,
  agentId: string,
  lossUsd?: number,
): Incident | undefined {
  const agent = state.agents.find((a) => a.id === agentId);
  if (agent === undefined) return undefined;

  const incident = buildIncident(scenarioId, agent, lossUsd);
  state.addIncident(incident);

  if (scenarioId === 'S-17') {
    // Near-miss: feed entry + data credit at renewal (REQ-7.9.3, AC-11).
    state.addNearMiss({
      id: `nm-${incident.id}`,
      type: 'blocked-injection',
      at: incident.discoveredAt,
      creditTag: '+ data credit at renewal',
      creditPoints: 0.01,
      description: 'Injection attempt blocked — reported',
    });
    state.addCredit(agentId, {
      type: 'near-miss',
      at: incident.discoveredAt,
      points: 0.01,
    });
  }
  return incident;
}

/**
 * Open (or return the existing) claim for an incident: create the claim,
 * populate the 12-item checklist from the applicability matrix (§5d), and put
 * near-miss claims on the 7-day notify window (GT-5).
 */
export function openClaimForIncident(
  state: Pick<RootState, 'claims' | 'openClaim' | 'updateClaim' | 'setClockState'>,
  incident: Incident,
): string {
  const existing = state.claims.find((c) => c.incidentId === incident.id);
  if (existing !== undefined) return existing.id;

  const claimId = state.openClaim(incident.id);
  state.updateClaim(claimId, { evidence: buildEvidenceChecklist(incident.scenarioId) });
  if (SCENARIOS[incident.scenarioId].nearMiss) {
    state.setClockState(claimId, {
      phase: 'Draft',
      anchors: { discoveredAt: incident.discoveredAt },
      nearMiss: true,
    });
  }
  return claimId;
}

// ---------------------------------------------------------------------------
// Adjudication-input builder (event-time state from interval histories)
// ---------------------------------------------------------------------------

/** Reconstruct the agent's tier-1/tier-2/suspension state at instant t. */
export function agentEventStateAt(agent: Agent, t: Timestamp): AgentEventState {
  const tier1At = Object.fromEntries(
    TIER1_GATES.map((g) => [g, intervalCovers(agent.gateHistory[g], t)]),
  ) as unknown as AgentEventState['tier1At'];
  const tier2At = Object.fromEntries(
    TIER2_CONTROLS.map((c) => [c, intervalCovers(agent.controlsHistory[c], t)]),
  ) as unknown as AgentEventState['tier2At'];
  return {
    agent,
    tier1At,
    tier2At,
    attestationOperative: tier2At.attestation,
    suspendedAt: intervalCovers(agent.suspensionHistory, t),
  };
}

export interface AdjudicationStateView {
  agents: Agent[];
  mandates: Record<string, Mandate[]>;
  enrollments: Enrollment[];
  operator: Operator;
}

/**
 * Assemble the pure adjudication input for an incident from live store state.
 * Everything is recomputed from interval histories at incident.eventAt — a
 * later cure or break never changes the answer (plan §5b, REQ-7.11.3).
 *
 * If the agent has no enrollment covering the event, a placeholder enrollment
 * with `effectiveAt` after the event is passed so the conditions-precedent
 * check honestly fails "not enrolled at event time".
 */
export function buildAdjudicationInput(
  state: AdjudicationStateView,
  incident: Incident,
  usdPerN: number,
): AdjudicationInput {
  const agent =
    state.agents.find((a) => a.id === incident.agentId) ?? state.agents[0];
  const t = incident.eventAt;

  const versions = state.mandates[agent.id] ?? [];
  const mandateAtEvent =
    versions.find(
      (m) =>
        m.inForceFrom !== undefined &&
        m.inForceFrom <= t &&
        (m.inForceTo === undefined || t < m.inForceTo),
    ) ??
    versions[versions.length - 1] ??
    createDefaultMandate();

  const agentEnrollments = state.enrollments.filter((e) => e.agentId === agent.id);
  const enrollment =
    agentEnrollments.find(
      (e) => e.effectiveAt <= t && (e.terminatedAt === undefined || t < e.terminatedAt),
    ) ??
    agentEnrollments[agentEnrollments.length - 1] ?? {
      // Placeholder: not effective at event time → "not enrolled" denial.
      agentId: agent.id,
      mandateVersion: mandateAtEvent.version,
      rateBreakdown: [],
      loadings: [],
      premiumUsd: 0,
      settledN: 0,
      conversionRateAtPayment: usdPerN,
      paymentPlan: 'annual' as const,
      paymentHistory: [],
      effectiveAt: t + 1,
      renewalAt: t + 1,
      credits: [],
    };

  return {
    incident,
    agentStateAtEvent: agentEventStateAt(agent, t),
    mandateAtEvent,
    enrollment,
    operatorHistory: state.operator.verificationHistory,
    usdPerN,
  };
}
