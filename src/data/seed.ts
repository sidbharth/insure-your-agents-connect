/**
 * Appendix B seed data (plan §7, PRD Appendix B — exact numbers).
 *
 * Everything here is deterministic (REQ-6.6): the same clicks always produce
 * the same numbers. `createSeedState()` returns a FRESH deep copy each call,
 * so `reset()` can restore the exact seed — including the seeded price
 * setting `pinned: false` (plan §6, AC-16).
 */
import { DAY_MS, HOUR_MS } from '../lib/clocks';
import { configHash } from '../lib/hash';
import type {
  Agent,
  Harness,
  Interval,
  Mandate,
  Operator,
  PriceFeedState,
  ProgrammeBook,
  ScenarioId,
  Tier1Controls,
  Tier1Gate,
  Tier2Controls,
  Tier2Control,
  ToolManifestEntry,
  WhitelistEntry,
} from '../store/types';
import {
  TIER1_GATES as GATES,
  TIER2_CONTROLS as CONTROLS,
} from '../store/types';

// ---------------------------------------------------------------------------
// Epoch & constants
// ---------------------------------------------------------------------------

/** Fixed seed epoch: 12 Jun 2026 09:00 UTC (dashboard mockup: "since 12 Jun 2026"). */
export const SEED_EPOCH = Date.UTC(2026, 5, 12, 9, 0, 0);

export { DAY_MS, HOUR_MS };

/** Seed N price (Appendix B): $3.00, UNPINNED. */
export const SEED_USD_PER_N = 3.0;

/** Demo wallet balance in N — must exceed the 1,383 N fleet roll-up. */
export const SEED_WALLET_BALANCE_N = 2_000;

/** Every seeded agent's per-transaction cap (Appendix B). */
export const SEED_CAP_USD = 50_000;

// ---------------------------------------------------------------------------
// Operator & payees
// ---------------------------------------------------------------------------

/** Six fictional payees, each older than the 24 h cooling period. */
export const SEED_PAYEES: WhitelistEntry[] = [
  { name: 'Cirrus Hosting GmbH', address: '0x91acbe2210d34a7cf7e1a8be6f0f5c3e0aa41c77', addedAt: SEED_EPOCH - 45 * DAY_MS },
  { name: 'Meridian Data Services', address: '0x3f5be80a6cf29a9d3d0871c11d4b8bd7ec2299fa', addedAt: SEED_EPOCH - 38 * DAY_MS },
  { name: 'Kestrel Logistics Ltd', address: '0x7a1dd0c4b95e2a86f6b32c9de4517f0ab8ce6641', addedAt: SEED_EPOCH - 31 * DAY_MS },
  { name: 'HMRC Client Account', address: '0xa25c11f8d9e04b7c8833a1fd2c664be09d175e02', addedAt: SEED_EPOCH - 27 * DAY_MS },
  { name: 'Orchard Parts Supply Co', address: '0x5be9dd014a7cf30b6a92418ecd57a2ff01c88b93', addedAt: SEED_EPOCH - 12 * DAY_MS },
  { name: 'Blue Anchor Freight', address: '0xc47a90e2f1bb5d68304ac2ee9d6f01527b3ae815', addedAt: SEED_EPOCH - 3 * DAY_MS },
];

export function createSeedOperator(): Operator {
  return {
    name: 'NEAR Foundation',
    registrationNumber: 'CHE-329.999.911',
    country: 'Switzerland',
    beneficialOwners: [
      { name: 'Maya Okafor', sharePct: 41 },
      { name: 'Daniel Voss', sharePct: 33 },
    ],
    // Plan §7: seed interval histories — verification interval open from seed epoch.
    verificationHistory: [{ from: SEED_EPOCH, verified: true }],
    walletBalance: SEED_WALLET_BALANCE_N,
  };
}

export const SEED_PRINCIPAL_NAME = 'Aria Chen' as const;

// ---------------------------------------------------------------------------
// Price feed (seeded UNPINNED — plan §6 / AC-16)
// ---------------------------------------------------------------------------

export function createSeedPriceFeed(): PriceFeedState {
  return {
    usdPerN: SEED_USD_PER_N,
    source: 'seed',
    fetchedAt: SEED_EPOCH,
    stale: false,
    pinned: false,
    pinnedValue: 3.0,
    lastKnown: SEED_USD_PER_N,
  };
}

// ---------------------------------------------------------------------------
// Programme book (Appendix B): total external caps $5,500,000
// ---------------------------------------------------------------------------

export const HELIOS = 'IronClaw v2.3';
export const ATLAS = 'Hermes v1';
export const BEACON = 'Eliza v4';
export const CUSTOM = 'Assorted custom harnesses';

export function createSeedBook(): ProgrammeBook {
  return {
    components: [
      { harness: HELIOS, externalCapsUsd: 2_090_000 }, // 38.0%
      { harness: ATLAS, externalCapsUsd: 1_400_000 },
      { harness: BEACON, externalCapsUsd: 900_000 },
      { harness: CUSTOM, externalCapsUsd: 1_110_000 },
    ],
    enrolledCapsUsd: {},
  };
}

// ---------------------------------------------------------------------------
// Agents (12, every cap $50,000)
// ---------------------------------------------------------------------------

const allOn = <K extends string>(keys: readonly K[]): Record<K, boolean> =>
  Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;

function openHistory<K extends string>(
  keys: readonly K[],
  state: Record<K, boolean>,
): Record<K, Interval[]> {
  return Object.fromEntries(
    keys.map((k) => [k, state[k] ? [{ from: SEED_EPOCH }] : []]),
  ) as Record<K, Interval[]>;
}

const HARNESSES: Record<string, Harness> = {
  [HELIOS]: { name: 'IronClaw', version: 'v2.3', audited: true },
  [ATLAS]: { name: 'Hermes', version: 'v1', audited: true },
  [BEACON]: { name: 'Eliza', version: 'v4', audited: true },
};

const BASE_MANIFEST: ToolManifestEntry[] = [
  { name: 'payments.send', publisher: 'NEAR AI', version: '3.1.0', permissions: ['transfer:whitelisted'] },
  { name: 'invoices.read', publisher: 'Ledgerworks', version: '2.4.2', permissions: ['read:invoices'] },
  { name: 'vendors.lookup', publisher: 'Meridian Data', version: '1.9.0', permissions: ['read:registry'] },
  { name: 'alerts.notify', publisher: 'NEAR Foundation', version: '1.2.1', permissions: ['notify:ops-channel'] },
];

export interface SeedAgentSpec {
  id: string;
  name: string;
  harnessKey: string;
  /** Legacy-Bot has no attestation available (REQ-7.3.3). */
  attestationAvailable: boolean;
  /** Rate at enrollment per Appendix B (points, before any live re-derivation). */
  seedRatePct: number;
  /** Carries the "+0.1% concentration" tag on import (Settle-Bot onward). */
  concentrationTag: boolean;
  /** Carries the "Coverage B excluded" chip (Legacy-Bot). */
  coverageBExcluded: boolean;
}

/** Procurement-Bot: connected in the wizard, enrolled FIRST (before imports). */
export const WIZARD_AGENT: SeedAgentSpec = {
  id: 'procurement-bot',
  name: 'Procurement-Bot',
  harnessKey: HELIOS,
  attestationAvailable: true,
  seedRatePct: 0.6,
  concentrationTag: false,
  coverageBExcluded: false,
};

/**
 * Fixed CSV-import order (plan §7 / Appendix B): Legacy-Bot, Relay-Bot, then
 * the nine IronClaw agents. Vendor-Bot's prospective share lands at exactly
 * 40.0000%; Settle-Bot crosses at 40.5085% and carries the loading, as do
 * the four after it.
 */
export const FLEET_IMPORT_ORDER: SeedAgentSpec[] = [
  { id: 'legacy-bot', name: 'Legacy-Bot', harnessKey: ATLAS, attestationAvailable: false, seedRatePct: 1.2, concentrationTag: false, coverageBExcluded: true },
  { id: 'relay-bot', name: 'Relay-Bot', harnessKey: BEACON, attestationAvailable: true, seedRatePct: 0.6, concentrationTag: false, coverageBExcluded: false },
  { id: 'payables-bot', name: 'Payables-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.6, concentrationTag: false, coverageBExcluded: false },
  { id: 'refunds-bot', name: 'Refunds-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.6, concentrationTag: false, coverageBExcluded: false },
  { id: 'treasury-bot', name: 'Treasury-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.6, concentrationTag: false, coverageBExcluded: false },
  { id: 'vendor-bot', name: 'Vendor-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.6, concentrationTag: false, coverageBExcluded: false },
  { id: 'settle-bot', name: 'Settle-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.7, concentrationTag: true, coverageBExcluded: false },
  { id: 'invoice-bot', name: 'Invoice-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.7, concentrationTag: true, coverageBExcluded: false },
  { id: 'renewals-bot', name: 'Renewals-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.7, concentrationTag: true, coverageBExcluded: false },
  { id: 'deposits-bot', name: 'Deposits-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.7, concentrationTag: true, coverageBExcluded: false },
  { id: 'clearing-bot', name: 'Clearing-Bot', harnessKey: HELIOS, attestationAvailable: true, seedRatePct: 0.7, concentrationTag: true, coverageBExcluded: false },
];

export const ALL_AGENT_SPECS: SeedAgentSpec[] = [WIZARD_AGENT, ...FLEET_IMPORT_ORDER];

function buildAgent(spec: SeedAgentSpec): Agent {
  const harness = HARNESSES[spec.harnessKey];
  const tier1: Tier1Controls = allOn(GATES as readonly Tier1Gate[]);
  const tier2: Tier2Controls = {
    ...allOn(CONTROLS as readonly Tier2Control[]),
    attestation: spec.attestationAvailable,
  };
  return {
    id: spec.id,
    name: spec.name,
    configHash: configHash(`${spec.name}|${spec.harnessKey}|manifest-v1`),
    harness,
    modelEndpointId: `model-endpoint/${spec.id}`,
    toolManifest: BASE_MANIFEST,
    attestation: spec.attestationAvailable
      ? { available: true, endpoint: `https://attest.demo/${spec.id}` }
      : { available: false },
    ownershipVerified: false,
    controls: { tier1, tier2 },
    gateHistory: openHistory(GATES, tier1),
    controlsHistory: openHistory(CONTROLS, tier2),
    suspensionHistory: [],
    status: 'Draft',
  };
}

export function createSeedAgents(): Agent[] {
  return ALL_AGENT_SPECS.map(buildAgent);
}

// ---------------------------------------------------------------------------
// Default mandate (PRD §7.4 defaults)
// ---------------------------------------------------------------------------

export function createDefaultMandate(): Mandate {
  return {
    version: '1.0',
    actionFamilies: {
      valueTransfers: true,
      tokenApprovals: false,
      configChanges: false,
      disputeFilings: false,
      settlementProtocol: false,
      credentialOps: false,
    },
    caps: {
      perTx: SEED_CAP_USD,
      daily: 120_000,
      rolling30d: 600_000,
      aggregate: 1_000_000,
    },
    assets: ['USDC', 'N'],
    chains: ['NEAR'],
    timelock: { threshold: 10_000, holdHours: 24 },
    whitelist: {
      mode: 'address',
      entries: SEED_PAYEES.map((p) => ({ ...p })),
      editors: ['Maya Okafor', 'Daniel Voss'],
      coolingHours: 24,
      openSet: false,
    },
    hitl: {
      threshold: 25_000,
      approvers: ['Maya Okafor'],
      channel: 'ops-approvals (Slack)',
    },
    maxSessionHours: 12,
  };
}

// ---------------------------------------------------------------------------
// Incident parameters (Appendix B, presenter injections)
// ---------------------------------------------------------------------------

export interface SeedIncidentParams {
  scenarioId: ScenarioId;
  title: string;
  lossGrossUsd: number;
  /** S-17 only: investigation cost paid under Coverage F. */
  investigationCostUsd?: number;
  /** S-18 only: scripted later recovery. */
  scriptedRecoveryUsd?: number;
  /** S-03 only: the cap module had passed its latest quarterly verification. */
  guardrailPassedVerification?: boolean;
}

export const SEED_INCIDENT_PARAMS: Record<ScenarioId, SeedIncidentParams> = {
  'S-03': {
    scenarioId: 'S-03',
    title: 'Cap-module failure',
    lossGrossUsd: 60_000, // attempted against the $50,000 cap → D pays the $10,000 excess
    guardrailPassedVerification: true,
  },
  'S-09': {
    scenarioId: 'S-09',
    title: 'Prompt injection',
    lossGrossUsd: 20_000, // paid $18,500 after the 500 N ($1,500) retention
  },
  'S-17': {
    scenarioId: 'S-17',
    title: 'Blocked injection (near-miss)',
    lossGrossUsd: 0,
    investigationCostUsd: 2_400,
  },
  'S-18': {
    scenarioId: 'S-18',
    title: 'Key exfiltration',
    lossGrossUsd: 35_000, // paid $33,500; scripted $10,000 recovery repays insurer first
    scriptedRecoveryUsd: 10_000,
  },
  'S-24': {
    scenarioId: 'S-24',
    title: 'Hallucinated invoice',
    lossGrossUsd: 12_000, // $0 — model-conduct denial letter
  },
};

// ---------------------------------------------------------------------------
// Full seed-state factory (the data portion of the store)
// ---------------------------------------------------------------------------

export interface SeedState {
  operator: Operator;
  agents: Agent[];
  mandates: Record<string, Mandate[]>;
  pendingEdits: Record<string, never>;
  enrollments: [];
  book: ProgrammeBook;
  nearMisses: [];
  incidents: [];
  claims: [];
  priceFeed: PriceFeedState;
  presenter: { panelOpen: boolean; armed: boolean; timeOffsetMs: number };
  showMath: boolean;
}

/** Fresh, deeply-copied seed state. reset() deep-equals against this. */
export function createSeedState(): SeedState {
  return {
    operator: createSeedOperator(),
    agents: createSeedAgents(),
    mandates: { [WIZARD_AGENT.id]: [createDefaultMandate()] },
    pendingEdits: {},
    enrollments: [],
    book: createSeedBook(),
    nearMisses: [],
    incidents: [],
    claims: [],
    priceFeed: createSeedPriceFeed(),
    presenter: { panelOpen: false, armed: false, timeOffsetMs: 0 },
    showMath: false,
  };
}
