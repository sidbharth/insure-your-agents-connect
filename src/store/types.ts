/**
 * FROZEN CONTRACTS (plan §3 + §10) — entities, interval histories, and the
 * slice/action interfaces every work package builds against.
 *
 * WP-0/WP-1 own this file. Screen WPs (WP-2..5) may NOT change it; contract
 * changes route back through a WP-1 amendment.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Milliseconds since epoch, always read through lib/demoClock. */
export type Timestamp = number;

/**
 * Temporal interval. Open `to` (undefined) = state still current. All four
 * conditions precedent are recorded as intervals so any event time can be
 * adjudicated after later state changes (plan §3, finding 2).
 */
export interface Interval {
  from: Timestamp;
  to?: Timestamp;
}

export interface SuspensionInterval extends Interval {
  reason: string;
}

export interface VerificationInterval extends Interval {
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/** The four non-negotiable eligibility gates (GT-1). */
export interface Tier1Controls {
  hashIdentity: boolean;
  transferCaps: boolean;
  whitelist: boolean;
  actionLogging: boolean;
}

/** The seven priced optional controls (GT-3). */
export interface Tier2Controls {
  attestation: boolean;
  kyb: boolean;
  timelock: boolean;
  recovery: boolean;
  harnessAudit: boolean;
  hitl: boolean;
  killSwitch: boolean;
}

export type Tier1Gate = keyof Tier1Controls;
export type Tier2Control = keyof Tier2Controls;

export const TIER1_GATES: readonly Tier1Gate[] = [
  'hashIdentity',
  'transferCaps',
  'whitelist',
  'actionLogging',
] as const;

export const TIER2_CONTROLS: readonly Tier2Control[] = [
  'attestation',
  'kyb',
  'timelock',
  'recovery',
  'harnessAudit',
  'hitl',
  'killSwitch',
] as const;

// ---------------------------------------------------------------------------
// Operator / price feed
// ---------------------------------------------------------------------------

export interface BeneficialOwner {
  name: string;
  sharePct: number;
}

export interface Operator {
  name: string;
  registrationNumber: string;
  country: string;
  beneficialOwners: BeneficialOwner[];
  /** Verified/unverified periods; open interval = current state. */
  verificationHistory: VerificationInterval[];
  /** Demo wallet balance in N (seeded > 1,383 N). */
  walletBalance: number;
}

export type PriceSource = 'CoinGecko' | 'seed';

export interface PriceFeedState {
  /** Effective USD-per-N rate the app uses (pin overrides live). */
  usdPerN: number;
  source: PriceSource;
  fetchedAt: Timestamp;
  stale: boolean;
  pinned: boolean;
  /** Exactly 3.00 (REQ-6.6, AC-15). */
  pinnedValue: number;
  /** Last successful live price (fallback under outage, REQ-6.3). */
  lastKnown: number;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface ToolManifestEntry {
  name: string;
  publisher: string;
  version: string;
  permissions: string[];
}

export interface Harness {
  name: string;
  version: string;
  audited: boolean;
}

export type AgentStatus =
  | 'Draft'
  | 'Quoted'
  | 'Active'
  | 'Suspended'
  | 'De-enrolled'
  | 'Declined';

export interface Agent {
  id: string;
  name: string;
  configHash: string;
  harness: Harness;
  modelEndpointId: string;
  toolManifest: ToolManifestEntry[];
  attestation: { available: boolean; endpoint?: string };
  ownershipVerified: boolean;
  controls: { tier1: Tier1Controls; tier2: Tier2Controls };
  /**
   * Operative periods per tier-1 gate. Presenter "trip gate" closes the open
   * interval; "cure" opens a new one. Current UI state = interval open now.
   */
  gateHistory: Record<Tier1Gate, Interval[]>;
  /** Operative periods per tier-2 control (attestation-at-event-time, adopt-a-control). */
  controlsHistory: Record<Tier2Control, Interval[]>;
  suspensionHistory: SuspensionInterval[];
  status: AgentStatus;
}

// ---------------------------------------------------------------------------
// Mandate
// ---------------------------------------------------------------------------

export interface ActionFamilies {
  valueTransfers: boolean;
  tokenApprovals: boolean;
  configChanges: boolean;
  disputeFilings: boolean;
  settlementProtocol: boolean;
  credentialOps: boolean;
}

export interface WhitelistEntry {
  name: string;
  address: string;
  addedAt: Timestamp;
}

export interface Mandate {
  version: string; // e.g. "1.0"
  actionFamilies: ActionFamilies;
  caps: { perTx: number; daily: number; rolling30d: number; aggregate: number };
  assets: string[];
  chains: string[];
  timelock: { threshold: number; holdHours: number };
  whitelist: {
    mode: 'address' | 'verified-identity' | 'resolvable-name';
    entries: WhitelistEntry[];
    editors: string[];
    coolingHours: 24;
    openSet: boolean;
  };
  hitl: { threshold: number; approvers: string[]; channel: string };
  maxSessionHours: number;
  countersigned?: { by: string; at: Timestamp };
  /** In-force interval for this mandate version (GT-8/AC-8). */
  inForceFrom?: Timestamp;
  inForceTo?: Timestamp;
}

export interface PendingMandateEdit {
  draft: Mandate;
  deltaUsd: number;
  deltaN: number;
}

// ---------------------------------------------------------------------------
// Enrollment (the policy schedule)
// ---------------------------------------------------------------------------

export interface RateLine {
  label: string;
  points: number;
  clause: string;
  group: 'ladder' | 'loading';
  /** e.g. "Coverage B excluded" or a coinsurance chip label. */
  coverageEffect?: string;
}

export type PaymentKind = 'initial' | 'installment' | 'delta';

export interface PaymentHistoryItem {
  kind: PaymentKind;
  dueAt: Timestamp;
  paidAt?: Timestamp;
  amountUsd: number;
  amountN: number;
  rateUsed: number;
}

export interface EnrollmentCredit {
  type: 'near-miss' | 'clean-year' | 'adopt-control';
  at: Timestamp;
  points: number;
}

export interface Enrollment {
  agentId: string;
  mandateVersion: string;
  rateBreakdown: RateLine[];
  loadings: RateLine[];
  premiumUsd: number;
  settledN: number;
  conversionRateAtPayment: number;
  paymentPlan: 'annual' | 'quarterly';
  /** Premium-current at t = no item due >15 days before t and unpaid at t. */
  paymentHistory: PaymentHistoryItem[];
  effectiveAt: Timestamp;
  renewalAt: Timestamp;
  terminatedAt?: Timestamp;
  credits: EnrollmentCredit[];
}

// ---------------------------------------------------------------------------
// Programme book (concentration)
// ---------------------------------------------------------------------------

export interface BookComponent {
  /** Shared-component key, e.g. "Helios v2.3". */
  harness: string;
  /** Fictional other-operator caps on this component (USD). */
  externalCapsUsd: number;
}

export interface ProgrammeBook {
  components: BookComponent[];
  /**
   * Enrolled operator caps by component (USD), committed atomically at
   * enrollment time (plan §4b).
   */
  enrolledCapsUsd: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Incidents / claims / near-misses
// ---------------------------------------------------------------------------

export type ScenarioId = 'S-03' | 'S-09' | 'S-17' | 'S-18' | 'S-24';

export type CoverageRoute = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type EvidenceStatus = 'auto' | 'uploaded' | 'missing' | 'notApplicable';

export interface EvidenceItem {
  /** 1..12 per framework Appendix 2. */
  id: number;
  label: string;
  status: EvidenceStatus;
  /** e.g. "auto-attached from your records". */
  source?: string;
}

export interface MockArtifact {
  kind: string;
  title: string;
  body: string;
}

export interface Incident {
  id: string;
  scenarioId: ScenarioId;
  agentId: string;
  narrative: string;
  discoveredAt: Timestamp;
  eventAt: Timestamp;
  lossGrossUsd: number;
  lossTxRefs: string[];
  containment: {
    killSwitchAt?: Timestamp;
    frozen: string[];
    rotated: string[];
  };
  /** Pre-built evidence artifacts keyed by evidence item id (REQ-7.12.1). */
  artifacts: Record<number, MockArtifact>;
  /** Optional debugging aid; adjudication always recomputes from interval histories. */
  conditionSnapshot?: ConditionState;

  // -- optional incident parameters (WP-1 amendment; Appendix B) -----------
  /** S-17 only: Coverage-F investigation cost for a near-miss (no loss). */
  investigationCostUsd?: number;
  /** Loss slice accrued after the first missed alert (kill-switch coinsurance, 5.5). */
  postFirstAlertLossUsd?: number;
  /** Loss slice a recovery mechanism would have recovered (recovery coinsurance, 5.5). */
  recoverableUsd?: number;
  /** S-03: the failed guardrail passed its latest scheduled verification (retention waiver, 5.3). */
  guardrailPassedVerification?: boolean;
}

export type ClaimPhase =
  | 'Draft'
  | 'Notified'
  | 'Acknowledged'
  | 'PackageReceived'
  | 'IncompleteNoticed'
  | 'PackageComplete'
  | 'Determined'
  | 'Paid';

export interface ClockState {
  phase: ClaimPhase;
  anchors: {
    discoveredAt: Timestamp;
    notifiedAt?: Timestamp;
    acknowledgedAt?: Timestamp;
    packageReceivedAt?: Timestamp;
    incompleteNoticeAt?: Timestamp;
    packageCompleteAt?: Timestamp;
    determinedAt?: Timestamp;
    paidAt?: Timestamp;
  };
  /** Presenter flag: insurer missed a clock ("delay doesn't count against you"). */
  insurerMissed?: boolean;
  /** Near-miss claims get a 7-day (not 48 h) notify window (WP-1 amendment, GT-5). */
  nearMiss?: boolean;
}

export interface DeadlineRow {
  label: string;
  dueAt?: Timestamp;
  whoseClock: 'Operator' | 'Insurer';
  status: 'met' | 'pending' | 'missed' | 'blocked';
  note?: string;
}

/** Conditions precedent evaluated at one instant (plan §5b). */
export interface ConditionState {
  gatesOperative: boolean;
  mandateInForce: boolean;
  premiumCurrent: boolean;
  verificationCurrent: boolean;
  suspended: boolean;
  enrolled: boolean;
}

/** Agent state reconstructed from interval histories at incident.eventAt. */
export interface AgentEventState {
  agent: Agent;
  tier1At: Tier1Controls;
  tier2At: Tier2Controls;
  attestationOperative: boolean;
  suspendedAt: boolean;
}

export interface RecoveryWaterfall {
  recoveredUsd: number;
  toInsurerUsd: number;
  toInsuredRetainedUsd: number;
  toUninsuredUsd: number;
}

import type { MathBreakdown } from '../lib/money';

export interface AdjudicationMath {
  grossLossUsd: number;
  coveredQuantumUsd: number;
  perEventLimitUsd: number;
  quantumAfterLimitUsd: number;
  coinsuranceUsd: number;
  retentionUsd: number;
  retentionWaived: boolean;
  payoutUsd: number;
  payoutN: number;
  rateUsed: number;
  breakdown: MathBreakdown;
}

export interface AdjudicationResult {
  conditionsPrecedent: { pass: boolean; failedCondition?: string };
  eligibility: {
    covered: boolean;
    route?: CoverageRoute;
    reason: string;
    clause: string;
  };
  math?: AdjudicationMath;
}

export interface Claim {
  id: string;
  incidentId: string;
  conditionsPrecedent: { pass: boolean; failedCondition?: string };
  adjudication?: AdjudicationResult;
  evidence: EvidenceItem[];
  clockState: ClockState;
  recovery?: { amountUsd: number; waterfall: RecoveryWaterfall };
}

export interface NearMiss {
  id: string;
  type: 'kill-switch' | 'timelock-hold' | 'hitl-rejection' | 'blocked-injection';
  at: Timestamp;
  creditTag: string;
  creditPoints: 0.01;
  description: string;
}

// ---------------------------------------------------------------------------
// Slice contracts (frozen action signatures)
// ---------------------------------------------------------------------------

/** Price feed slice (plan §6). Fetch fn is injectable for tests. */
export interface PriceFeedSlice {
  priceFeed: PriceFeedState;
  /** Imperative fetch used on init, every 60 s, and before every payment. */
  refetchNow: () => Promise<void>;
  /** Presenter: pin the effective rate to exactly $3.00. */
  pinPrice: () => void;
  /** Presenter: return to the live feed. */
  unpinPrice: () => void;
}

/**
 * Session slice: operator, agents, mandates, enrollments, fleet, book,
 * interval histories. All state transitions write interval boundaries, never
 * overwrite booleans (plan §5b).
 */
export interface SessionSlice {
  operator: Operator;
  agents: Agent[];
  /** Mandate versions per agent, ordered; last = newest. */
  mandates: Record<string, Mandate[]>;
  pendingEdits: Record<string, PendingMandateEdit>;
  enrollments: Enrollment[];
  book: ProgrammeBook;
  nearMisses: NearMiss[];

  // -- identity / verification --------------------------------------------
  renameOperator: (name: string) => void;
  /** KYB verify: opens a verified interval at `at` (default demo now). */
  verifyOperator: (at?: Timestamp) => void;
  /** Presenter/skip: closes the open verified interval at `at`. */
  revokeVerification: (at?: Timestamp) => void;

  // -- agents ---------------------------------------------------------------
  /** Register (connect) an agent; returns its id. */
  registerAgent: (agent: Agent) => string;
  markOwnershipVerified: (agentId: string) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  setTier1: (agentId: string, gate: Tier1Gate, on: boolean) => void;
  setTier2: (agentId: string, control: Tier2Control, on: boolean) => void;
  /** Presenter/suspension triggers: close the gate's open interval. */
  tripGate: (agentId: string, gate: Tier1Gate, at?: Timestamp) => void;
  /** Cure: open a new interval for the gate. */
  cureGate: (agentId: string, gate: Tier1Gate, at?: Timestamp) => void;
  suspendAgent: (agentId: string, reason: string, at?: Timestamp) => void;
  /**
   * Cause-specific cure: closes only open suspension intervals with the given
   * reason (all open ones when reason is omitted); the agent derives Active
   * only when no open suspension remains.
   */
  unsuspendAgent: (agentId: string, at?: Timestamp, reason?: string) => void;
  deEnrollAgent: (agentId: string, at?: Timestamp) => void;

  // -- mandates -------------------------------------------------------------
  /** Save/replace the newest (draft) mandate version for an agent. */
  saveMandate: (agentId: string, mandate: Mandate) => void;
  countersignMandate: (agentId: string, at?: Timestamp, by?: string) => void;
  setPendingEdit: (agentId: string, edit: PendingMandateEdit) => void;
  clearPendingEdit: (agentId: string) => void;
  /** Commit a paid pending edit: closes old version's inForceTo, opens new (AC-8). */
  commitMandateEdit: (agentId: string, at?: Timestamp) => void;

  // -- enrollments / payments ----------------------------------------------
  addEnrollment: (enrollment: Enrollment) => void;
  /** Patch the live (non-terminated) enrollment — e.g. re-price after a paid mandate edit (AC-8/AC-14). */
  updateEnrollment: (agentId: string, patch: Partial<Enrollment>) => void;
  appendPaymentItem: (agentId: string, item: PaymentHistoryItem) => void;
  /** Presenter: mark an installment overdue (unpaid past-due item). */
  markInstallmentOverdue: (agentId: string, at?: Timestamp) => void;
  /**
   * Cure: settle any still-unpaid payment-history items by stamping paidAt.
   * Without this, curing a premium-overdue suspension only closes the
   * suspension interval — premiumCurrentAt still evaluates the stale unpaid
   * item and would fail any later claim's conditions precedent forever.
   */
  payOverdueInstallments: (agentId: string, at?: Timestamp) => void;
  /** Stamp the chosen payment plan on live enrollments before paying. */
  setPaymentPlan: (agentIds: string[], plan: 'annual' | 'quarterly') => void;
  /**
   * Activation transition after an initial-payment receipt: flips agents to
   * Active, stamps effectiveAt + conversionRateAtPayment, opens gate/mandate
   * intervals (plan §7a).
   */
  activateEnrollments: (receipt: import('../lib/payments').PaymentReceipt) => void;
  addCredit: (agentId: string, credit: EnrollmentCredit) => void;

  // -- book / near-misses -----------------------------------------------
  /** Atomic enroll onto the book (plan §4b) — updates enrolledCapsUsd. */
  commitBookEnrollment: (component: string, capUsd: number) => void;
  /** Presenter: move the Helios external share up/down. */
  setBookComponentCaps: (harness: string, externalCapsUsd: number) => void;
  addNearMiss: (nearMiss: NearMiss) => void;

  // -- wallet ---------------------------------------------------------------
  debitWallet: (amountN: number) => void;
}

/** Claims slice: incidents, claims, near-miss claims (WP-5 adds presenter-driven actions). */
export interface ClaimsSlice {
  incidents: Incident[];
  claims: Claim[];

  addIncident: (incident: Incident) => void;
  /** Open a claim shell for an incident; returns claim id. */
  openClaim: (incidentId: string) => string;
  updateClaim: (claimId: string, patch: Partial<Claim>) => void;
  setEvidenceStatus: (claimId: string, itemId: number, status: EvidenceStatus) => void;
  setClockState: (claimId: string, clockState: ClockState) => void;
  setAdjudication: (claimId: string, result: AdjudicationResult) => void;
}

/**
 * Presenter slice (state shape frozen here; WP-5 owns the action bodies).
 * All presenter mutations are actions here + defined session-slice actions;
 * other WPs only read resulting state.
 */
export interface PresenterSlice {
  presenter: {
    /** Panel overlay open (chord Shift+D ×3 or ?presenter=1). */
    panelOpen: boolean;
    /** Dashboard "Simulate incident" affordance armed (read by WP-4). */
    armed: boolean;
    /** Virtual-clock offset; demoClock reads this. */
    timeOffsetMs: number;
  };
  setPanelOpen: (open: boolean) => void;
  setArmed: (armed: boolean) => void;
  /** Fast-forward presets add to the offset (+2 bd/+5 bd/+30 d/+10 d/+1 y). */
  advanceTime: (byMs: number) => void;
  /** Inject a scenario against a target agent with an editable loss amount. */
  injectIncident: (scenarioId: ScenarioId, agentId: string, lossUsd?: number) => void;
}

/** The role the visitor enrolls under (framework Appendix 1 parties). */
export type EnrollmentRole = 'operator' | 'principal' | 'both';

/** UI slice: global "Show the math" toggle (REQ-6.7) + selected role. */
export interface UiSlice {
  showMath: boolean;
  setShowMath: (on: boolean) => void;
  /** null until the visitor picks a role on the landing page. */
  role: EnrollmentRole | null;
  setRole: (role: EnrollmentRole) => void;
}

export interface RootActions {
  /**
   * Restore the exact seed state — INCLUDING the seeded price setting, which
   * is `pinned: false` (plan §6, AC-16). A presenter pin never survives reset.
   */
  reset: () => void;
  /**
   * Monotonic token bumped by every reset(). Async workflows (in-flight
   * payments, import sweeps, latency theater) capture it when they start and
   * abandon their side effects if it changed — a stale callback must never
   * mutate a freshly reset store (AC-16).
   */
  resetGeneration: number;
}

export type RootState = PriceFeedSlice &
  SessionSlice &
  ClaimsSlice &
  PresenterSlice &
  UiSlice &
  RootActions;
