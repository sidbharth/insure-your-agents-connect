/**
 * Long-form on-screen copy skeleton (plan §2): exclusion wall, coverage
 * cards, tooltips, denial-letter templates. Text quoted from the PRD
 * (§7.6, §7.11, GT-4, D1/D4) wherever the PRD quotes it.
 */
import type { CoverageRoute, ScenarioId } from '../store/types';

// ---------------------------------------------------------------------------
// Positioning / shell
// ---------------------------------------------------------------------------

export const POSITIONING_LINE = 'Insure your Agents for up to $50,000.';

export const RESET_FOOTNOTE =
  'Data is stored in this browser only. Save your session to keep progress across reloads. Unsaved changes revert to the sample fleet.';

export const UNVERIFIED_BANNER =
  'Operator not verified. A 0.4% surcharge applies to every quote, and no claim is payable for events that occur while verification is not current. Verifying later protects future events only.';

// ---------------------------------------------------------------------------
// Coverage cards (PRD §7.6) — display-only, derived, never selected
// ---------------------------------------------------------------------------

export interface CoverageCardCopy {
  route: CoverageRoute;
  title: string;
  /** Compact label for the narrow sidebar mini-cards. */
  shortTitle: string;
  oneLiner: string;
  whatItPays: string;
  keyCondition: string;
}

export const COVERAGE_CARDS: CoverageCardCopy[] = [
  {
    route: 'A',
    title: 'Unauthorized agent transaction',
    shortTitle: 'Unauthorized transaction',
    oneLiner:
      'Covers net asset losses when the agent acts outside its mandate. Proof of an attacker is not required.',
    whatItPays:
      'Net assets that left when the agent acted outside its mandate, whether a wrong payee, an amount over the cap, a wrong asset or chain, or an undelegated action.',
    keyCondition: 'The countersigned mandate defines the permitted actions.',
  },
  {
    route: 'B',
    title: 'Agent compromise',
    shortTitle: 'Agent compromise',
    oneLiner:
      'Pays when an attacker manipulated the agent while it stayed inside its limits.',
    whatItPays:
      'Losses from prompt injection, poisoned data, a compromised tool, a spoofed instruction channel, or a deepfaked approval.',
    keyCondition:
      'Manipulation must be provable through attested records. This coverage is excluded when attestation is disabled.',
  },
  {
    route: 'C',
    title: 'Key and credential compromise',
    shortTitle: 'Key compromise',
    oneLiner:
      'Pays when signing credentials inside the disclosed setup are stolen or misused.',
    whatItPays:
      'Funds moved without the agent or the Principal initiating them, signed with stolen credentials from the disclosed key map.',
    keyCondition:
      'Only credentials in the disclosed key map are covered. Credentials held outside the disclosed setup are not.',
  },
  {
    route: 'D',
    title: 'Guardrail failure',
    shortTitle: 'Guardrail failure',
    oneLiner:
      'Pays the portion of a loss that a scheduled guardrail would have stopped had it operated as specified.',
    whatItPays:
      'The amount over a cap that the cap check let through, the amount a timelock should have held, or losses after a kill switch was activated but not honored.',
    keyCondition:
      'The deductible is waived if that guardrail had passed its latest scheduled verification.',
  },
  {
    route: 'E',
    title: 'Counterparty liability',
    shortTitle: 'Counterparty liability',
    oneLiner:
      'Pays damages and defense costs when a third party claims a covered failure of your agent caused them loss.',
    whatItPays:
      "Damages and defense costs claimed by a merchant, wallet, solver, or another agent's owner for a covered failure of your agent.",
    keyCondition:
      'Defense costs reduce the limit. The limit for each event is 50% of the cap.',
  },
  {
    route: 'F',
    title: 'Incident response and recovery',
    shortTitle: 'Response & recovery',
    oneLiner:
      'Covers investigation, tracing, bounties, freezes, and key rotation, including qualifying near miss investigations.',
    whatItPays:
      'Investigation, on-chain tracing, approved white-hat bounties, legal freezes, emergency key rotation.',
    keyCondition:
      'The limit for each event is 15% of the cap, with recovery and bounty costs capped at 10%. Reported near misses earn renewal credits.',
  },
];

export const COVERAGE_PANEL_TOOLTIP =
  'Coverage is derived from the controls you run.';

export const COVERAGE_B_GREY_REASON =
  'Coverage B (agent compromise) is excluded because manipulation cannot be proven without attested inputs.';

// ---------------------------------------------------------------------------
// Exclusion wall (PRD §7.6.3 / GT-4) — never collapsible by default
// ---------------------------------------------------------------------------

export const EXCLUSION_WALL_MANTRA =
  "The policy insures the delegation and the machinery around it, not the model's judgment.";

export const EXCLUSION_WALL: string[] = [
  "Losses caused by the model producing an incorrect result. The policy covers the delegation and the systems that enforce it, not the quality of the model's output.",
  'Losses from market price movements, including stablecoin depegs.',
  'Failure or forking of the underlying blockchain.',
  'Compromise of a third-party protocol that the agent used within its mandate.',
  'A transfer the Principal personally authorized while deceived. This risk belongs to a conventional crime policy.',
  'Losses incurred while running a configuration that was changed without notice to the insurer.',
  'Losses arising from sanctions, war, or state-sponsored attacks.',
  "Fraud committed by the Operator's own leadership.",
];

// ---------------------------------------------------------------------------
// Tier-2 surcharge chips + insurer's-why hovers (PRD §7.5)
// ---------------------------------------------------------------------------

export interface Tier2Copy {
  key: string;
  label: string;
  surcharge: string;
  chip?: string;
  insurersWhy: string;
}

export const TIER2_COPY: Tier2Copy[] = [
  {
    key: 'attestation',
    label: 'TEE attestation',
    surcharge: '+0.6%',
    chip: COVERAGE_B_GREY_REASON,
    insurersWhy:
      'Without tamper-proof receipts of what the agent saw and did, "we believe it was tricked" is unprovable.',
  },
  {
    key: 'kyb',
    label: 'Verified company identity (KYB)',
    surcharge: '+0.4%',
    chip: 'and no event during an unverified period can be claimed',
    insurersWhy: "We can't pursue recovery against a company we can't name.",
  },
  {
    key: 'timelock',
    label: 'Timelock on large transfers',
    surcharge: '+0.3%',
    insurersWhy:
      'A hold window is the last chance to catch and reverse a bad transfer before it leaves.',
  },
  {
    key: 'recovery',
    label: 'Recovery mechanism',
    surcharge: '+0.3%',
    chip: 'and you keep 20% of whatever a recovery path would have clawed back',
    insurersWhy: 'No recovery path means every recoverable dollar stays lost.',
  },
  {
    key: 'harnessAudit',
    label: 'Independent harness audit',
    surcharge: '+0.3%',
    chip: 'and 20% coinsurance on guardrail-failure claims until first audit',
    insurersWhy: 'Guardrails that have not been assessed cannot be priced.',
  },
  {
    key: 'hitl',
    label: 'Human approval above threshold',
    surcharge: '+0.3%',
    chip: 'and you keep 15% of losses above the threshold',
    insurersWhy:
      'Human review above the threshold is the most effective large-loss circuit breaker.',
  },
  {
    key: 'killSwitch',
    label: 'Kill switch + anomaly monitoring',
    surcharge: '+0.2%',
    chip: 'and you keep 15% of losses after the first missed alert',
    insurersWhy:
      'Losses that continue after the first alert should have been stoppable.',
  },
];

export const TIER1_DECLINE_COPY = (gateLabel: string) =>
  `The programme declines any agent without ${gateLabel}. Enable the control to restore your quote.`;

export const COUNTERSIGN_GATE_REASON =
  "Cover requires the Principal's countersignature.";

export const S31_NOTE =
  'If the mandate itself is wrong, for example a cap entered as $500,000 instead of $50,000, the policy does not pay for the error. The countersignature is what makes the mandate authoritative.';

export const OPEN_SET_LOADING_NOTE = '+0.3% added to the compromise-coverage rate';

// ---------------------------------------------------------------------------
// Advanced pricing disclosure — STATIC copy, not computed (plan §4)
// ---------------------------------------------------------------------------

export const ADVANCED_PRICING_COPY = [
  'Payment rail adjustments. A rail that binds an exact amount to an exact payee and provides a short reversal window earns a 0.05% discount. A reusable or open-amount credential rail adds 0.1%. Neither adjustment applies to this quote.',
  'Research-only agent floor. An agent that moves no funds still pays at least 25% of the base premium because Coverages E and F remain in force. This floor does not apply to this quote.',
];

// ---------------------------------------------------------------------------
// Claims copy
// ---------------------------------------------------------------------------

export const INSURER_DELAY_NOTE =
  'Insurer delays do not count against your time limits.';

export const CLAIM_EMPTY_STATE =
  'No incidents reported on your fleet. Detected incidents appear here with their records attached.';

export const SUSPENSION_COPY =
  'During suspension, new events are not covered. Prior events remain claimable. Other agents are unaffected.';

export const NEAR_MISS_CREDIT_HOVER =
  'Reporting a near-miss within 7 days earns a renewal credit and improves programme loss data.';

// The twelve evidence items (framework Appendix 2), labels shared by all WPs.
export const EVIDENCE_ITEM_LABELS: Record<number, string> = {
  1: 'Signed incident narrative',
  2: 'Countersigned mandate version',
  3: 'Configuration hash + attestation chain',
  4: 'Action-log extract (24h before first loss through containment)',
  5: 'Chain tracing report',
  6: 'Attested input/output records (Coverage B)',
  7: 'Credential access logs + rotation evidence (Coverage C)',
  8: 'Guardrail spec + verification history + failing log line (Coverage D)',
  9: 'Counterparty demand (Coverage E)',
  10: 'Containment record',
  11: 'Valuation inputs',
  12: 'Recovery actions record',
};

// ---------------------------------------------------------------------------
// Denial-letter templates (REQ-7.11.4 — polished end screens, never errors)
// ---------------------------------------------------------------------------

export const DENIAL_MODEL_CONDUCT = {
  title: 'Determination: not covered (model conduct)',
  body:
    'We reviewed the attested inputs and outputs for this event. They show no adversarial content, no compromised tool, and no spoofed instruction channel: the agent paid a real, whitelisted payee, within its cap, because the model was simply wrong. The policy insures the delegation and its safety machinery, not the model\'s judgment. Model error, downtime, and training quality are excluded model conduct.',
  counterfactual:
    'Had the attested inputs shown crafted adversarial content, this would have been Coverage B.',
  clause: 'Model Conduct Boundary',
};

export const DENIAL_CONDITION_PRECEDENT = {
  title: 'Determination: not payable (condition precedent)',
  body:
    'No claim is payable for an event that occurred while verification was not current. Verifying now protects future events.',
  forwardAction: 'Complete verification',
  clause: 'T3.4',
};

// ---------------------------------------------------------------------------
// Fleet teaching callouts (PRD §7.7)
// ---------------------------------------------------------------------------

export const FLEET_CALLOUT_SUM = {
  title: 'Why is the total just the sum?',
  body: 'Each agent is priced on its own controls and cap. There is no volume discount. Each agent is a separate risk.',
};

export const FLEET_CALLOUT_COMMON_CAUSE = {
  title: 'What a fleet does change',
  body: 'If one shared bug hits every agent, that counts as one event: one per-event limit and one deductible, not one payout per agent. Shared infrastructure concentrates risk.',
};

export const CONCENTRATION_METER_LABEL = 'programme-wide, simulated';

// ---------------------------------------------------------------------------
// Pay screen (PRD §7.8)
// ---------------------------------------------------------------------------

export const PAY_FRAMING =
  "The amount due now is the annual premium. The claims fund is seeded by the programme's treasury. The retention (your deductible) is not collected up front. It applies per event, only if a loss occurs.";

export const QUARTERLY_NOTE =
  'Cover is suspended if an installment is more than 15 days overdue.';

export const ACTIVATION_CEREMONY_LINE =
  'Cover attached the moment three records existed together: your agent\'s fingerprint, the countersigned mandate, and this payment.';

export const POLICY_SCHEDULE_CAPTION =
  'This enrollment record constitutes the policy schedule.';

// ---------------------------------------------------------------------------
// Claim demo (screens /claim/demo and /claim/demo/:incidentId)
//
// Self-serve walkthrough of the claims flow: pick a simulated incident, watch
// detection and containment land on the record, then file the claim through
// the standard five-step flow. All user-facing demo strings live here so the
// claim-demo copy test can enforce the punctuation rules (no colons,
// semicolons, or dashes of any kind in this copy).
// ---------------------------------------------------------------------------

export const CLAIM_DEMO_COPY = {
  entry: 'Start claim demo',
  title: 'Claim demo',
  coverTitle: 'Cover is not active for the sample agent',
  coverBody: (agentName: string) =>
    `Activate simulated cover for ${agentName} to run the demo, or complete the purchase flow first.`,
  activate: 'Activate cover',
  activationTitle: 'Activating simulated cover',
  activationSteps: [
    'Countersigning the mandate…',
    'Pricing the controls…',
    'Collecting the annual premium…',
    'Activating cover…',
  ],
  run: 'Run this incident →',
  pickerLossFigure: (amount: string) => `Gross loss ${amount}`,
  pickerNearMissFigure: (amount: string) =>
    `${amount} in investigation costs with no loss`,
  detectionTitle: 'Incident detected',
  feedTitle: 'Monitoring record',
  alertLine: 'Anomaly monitoring raised the first alert.',
  killLine: 'Kill switch engaged. The agent halted.',
  freezeLine: 'Affected whitelist entries frozen.',
  rotateLine: 'Implicated signing credentials rotated.',
  lossLine: (amount: string) => `Gross loss quantified at ${amount}.`,
  investigationLine: (amount: string) =>
    `No value moved. Investigation costs recorded at ${amount}.`,
  recordLine: 'Incident record assembled and preserved.',
  fileClaim: 'File the claim →',
  chooseAnother: 'Choose a different incident',
  summaryLabels: {
    agent: 'Agent',
    eventTime: 'Event time',
    grossLoss: 'Gross loss',
    investigation: 'Investigation costs',
  },
} as const;

// ---------------------------------------------------------------------------
// Claims page tabs + appeal (screen 7.11 additions)
// ---------------------------------------------------------------------------

export const CLAIM_HISTORY_COPY = {
  tabIncidents: 'Incidents',
  tabHistory: 'History',
  empty: 'No claims yet. Claims you open appear here with their status.',
  opened: (date: string) => `Opened ${date}`,
  statusPaid: 'Paid',
  statusDenied: 'Denied',
  statusApproved: 'Approved',
  statusInProgress: 'In progress',
} as const;

export const APPEAL_COPY = {
  action: 'Appeal claim',
  formTitle: 'Appeal this determination',
  formBody:
    'Set out why the determination should be reviewed. Attach any records that support the appeal.',
  groundsLabel: 'Grounds for appeal',
  attach: 'Attach a document',
  submit: 'Submit appeal →',
  cancel: 'Cancel',
  submittedTitle: 'Appeal received',
  submittedBody:
    'The committee acknowledges appeals within 2 business days and replies with a reasoned decision on the same record.',
} as const;

export interface ClaimDemoScenarioCopy {
  scenarioId: ScenarioId;
  title: string;
  summary: string;
  outcome: string;
  outcomeKind: 'paid' | 'nearMiss' | 'denied';
}

export const CLAIM_DEMO_SCENARIOS: ClaimDemoScenarioCopy[] = [
  {
    scenarioId: 'S-03',
    title: 'Cap module failure',
    summary:
      'A transfer cleared above the cap because the cap check failed to fire. The policy pays the slice the guardrail should have stopped, and the deductible is waived because the guardrail had passed its latest test.',
    outcome: 'Pays under Coverage D',
    outcomeKind: 'paid',
  },
  {
    scenarioId: 'S-09',
    title: 'Prompt injection',
    summary:
      'A poisoned catalogue page steered the agent into paying an attacker while it stayed inside every limit. Attested records prove the manipulation, so the compromise is covered.',
    outcome: 'Pays under Coverage B',
    outcomeKind: 'paid',
  },
  {
    scenarioId: 'S-17',
    title: 'Blocked injection attempt',
    summary:
      'An injection attempt was caught and refused before any value moved. Nothing was lost, the event is reportable, and the investigation costs are covered.',
    outcome: 'Near miss under Coverage F',
    outcomeKind: 'nearMiss',
  },
  {
    scenarioId: 'S-18',
    title: 'Key exfiltration',
    summary:
      'Stolen session credentials moved funds without the agent acting at all. The loss is covered, and tracing later claws part of it back.',
    outcome: 'Pays under Coverage C',
    outcomeKind: 'paid',
  },
  {
    scenarioId: 'S-24',
    title: 'Hallucinated invoice',
    summary:
      'The agent paid an invoice that only ever existed in its own output. Clean attested inputs prove nothing tricked it, so the loss is excluded as model conduct.',
    outcome: 'Ends in a denial',
    outcomeKind: 'denied',
  },
];

/** Opening feed line of the detection playback, per scenario. */
export const CLAIM_DEMO_FEED_EVENT: Record<ScenarioId, string> = {
  'S-03': 'The agent initiated a transfer above the cap and the cap check did not fire.',
  'S-09': 'The agent paid a spoofed payee after processing a poisoned catalogue page.',
  'S-17': 'An inbound attachment carried a crafted instruction. The input filter refused the tool call.',
  'S-18': 'Transfers signed with stolen session credentials began leaving controlled addresses.',
  'S-24': 'The agent paid an invoice for goods that were never ordered.',
};
