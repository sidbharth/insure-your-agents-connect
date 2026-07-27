/**
 * Long-form on-screen copy skeleton (plan §2): exclusion wall, coverage
 * cards, tooltips, denial-letter templates. Text quoted from the PRD
 * (§7.6, §7.11, GT-4, D1/D4) wherever the PRD quotes it.
 */
import type { CoverageRoute, ScenarioId } from '../store/types';

// ---------------------------------------------------------------------------
// Positioning / shell
// ---------------------------------------------------------------------------

export const POSITIONING_LINE = 'Cover your Agents with NEAR.';

export const RESET_FOOTNOTE =
  'Data is stored in this browser only. Save your session to keep progress across reloads. Unsaved changes revert to the sample fleet.';

export const UNVERIFIED_BANNER =
  'Operator not verified. A 0.4% surcharge applies to every quote, and no claim is payable for events that occur while verification is not current. Verifying later protects future events only.';

// ---------------------------------------------------------------------------
// Coverage cards (PRD §7.6) — display-only, derived, never selected
// ---------------------------------------------------------------------------

export interface CoverageCardCopy {
  route: CoverageRoute;
  /** Letter shown to the user when it differs from the engine route. */
  letter?: string;
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
    route: 'F',
    letter: 'E',
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
  "The policy covers the delegation and the machinery around it, not the model's judgment.";

export const EXCLUSION_WALL: string[] = [
  "Losses caused by the model producing an incorrect result. The policy covers the delegation and the systems that enforce it, not the quality of the model's output.",
  'Losses from market price movements, including stablecoin depegs.',
  'Failure or forking of the underlying blockchain.',
  'Compromise of a third-party protocol that the agent used within its mandate.',
  'A transfer the Principal personally authorized while deceived. This risk belongs to a conventional crime policy.',
  'Losses incurred while running a configuration that was changed without notice to the programme.',
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
    chip: 'and a 20% retained share on guardrail failure claims until first audit',
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
  'Programme delays do not count against your time limits.';

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
    'We reviewed the attested inputs and outputs for this event. They show no adversarial content, no compromised tool, and no spoofed instruction channel: the agent paid a real, whitelisted payee, within its cap, because the model was simply wrong. The policy covers the delegation and its safety machinery, not the model\'s judgment. Model error, downtime, and training quality are excluded model conduct.',
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

/**
 * The six disclosure pages of the connect flow (/flow/terms/1..6). Written
 * for informed consent. Every page states plainly what the coverage pays,
 * what it excludes, and how payment is calculated, and carries its own
 * acknowledgment line. Same punctuation rules as FLOW_COPY.
 */
export interface FlowTermsPage {
  /** Engine route (drives limits). */
  route: CoverageRoute;
  /** Letter shown to the user (response cover displays as E). */
  letter: string;
  title: string;
  intro: string;
  covered: string[];
  notCovered: string[];
  payment: string;
  acknowledgment: string;
}

export const FLOW_TERMS: FlowTermsPage[] = [
  {
    route: 'A',
    letter: 'A',
    title: 'Wrong payments by your agent',
    intro:
      'Agents are good at moving money, but they can slip. A wrong payee, an amount past the limit, an asset they were never meant to touch. Coverage A pays you back when your agent moves money outside the rules you signed off on, whether or not anyone attacked it.',
    covered: [
      'Payments to someone who is not on the approved list.',
      'Payments above the per transaction limit or faster than the allowed pace.',
      'Payments in an asset or on a chain the rules do not allow.',
      'Actions the agent was never given, like token approvals or deploying contracts.',
      'The network fees burned by the incident and by cleaning it up, within a small allowance.',
    ],
    notCovered: [
      'Payments that followed the rules, even if the outcome was bad.',
      'Losses from prices moving, including a stablecoin losing its peg.',
      'Rules that were set wrong and signed anyway. What you signed is what counts.',
      'The agent making a poor call while staying inside the rules.',
    ],
    payment:
      'We pay back the money that actually left, valued at market prices from just before the incident, minus anything recovered. Your share, the greater of 500 $NEAR or 2% of the loss, comes off the payout.',
    acknowledgment: 'I understand what Coverage A pays for and what it does not.',
  },
  {
    route: 'B',
    letter: 'B',
    title: 'Your agent was tricked',
    intro:
      'Attackers do not need to break in. They can trick your agent with a poisoned page, a fake instruction, or a bad tool, and every payment still looks like it followed the rules. Coverage B pays you back when your agent was manipulated.',
    covered: [
      'Hidden instructions planted in content the agent reads, like a product page or an attachment.',
      'Poisoned data or memory the agent relied on.',
      'A compromised tool or plugin inside the approved set.',
      'Someone impersonating you to the agent.',
      'A fake approval made with synthetic voice or video.',
    ],
    notCovered: [
      'Losses where the tamper proof logs (attestation) cannot show the trick actually happened.',
      'Any loss while the agent runs without tamper proof logging. This whole coverage switches off in that case.',
      'The agent simply getting it wrong on clean inputs. That is the model, not an attacker.',
      'Tricks aimed at a person rather than at the agent.',
    ],
    payment:
      'Same as Coverage A. We pay back what left, plus the cost of responding to the incident. Your standard share comes off the payout.',
    acknowledgment:
      'I understand what Coverage B pays for and that it needs tamper proof logging.',
  },
  {
    route: 'C',
    letter: 'C',
    title: 'Stolen keys and credentials',
    intro:
      'Your agent signs payments with keys. If those keys are stolen, an attacker can move money without touching the agent at all. Coverage C pays you back when credentials you told us about are stolen or misused.',
    covered: [
      'Stolen or misused agent session keys.',
      'Compromised key shares inside the setup you disclosed.',
      'Misused payment credentials, including replayed payment authorizations.',
      'The reasonable cost of swapping keys, moving wallets, and restoring tamper proof logging afterward.',
    ],
    notCovered: [
      'Keys and credentials you never told us about.',
      'Keys you keep personally, outside the agent setup.',
      'Fraud by your own leadership.',
    ],
    payment:
      'We pay back what left plus the cleanup costs above. If the misuse came from one of your own people below leadership, you keep 25% of that loss. Your standard share comes off the payout.',
    acknowledgment: 'I understand Coverage C protects the keys I disclosed and only those.',
  },
  {
    route: 'D',
    letter: 'D',
    title: 'A safety control failed',
    intro:
      'Safety controls are supposed to catch mistakes before money moves. A limit check, a holding delay, a kill switch. Coverage D pays you back when one of those controls fails to do its job and a loss gets through.',
    covered: [
      'A limit check that let an oversized payment through. We cover the amount above the limit.',
      'A holding delay that failed to hold a large payment. We cover what should have been held.',
      'A kill switch that was hit but did not stop the agent. We cover the losses after that moment.',
      'A monitor that stayed silent on a pattern it was set up to catch.',
    ],
    notCovered: [
      'Controls that are not on your agreed list.',
      'Failures the logs cannot verify.',
      'The model failing to be careful. Judgment is not a safety control.',
      'The part of a loss the control could not have stopped even if it worked.',
    ],
    payment:
      'We pay the slice of the loss the control should have stopped. If the control had passed its latest check, we skip your share entirely.',
    acknowledgment:
      'I understand Coverage D applies to the agreed safety controls, verified from logs.',
  },
  {
    route: 'F',
    letter: 'E',
    title: 'Response and recovery costs',
    intro:
      'When something goes wrong, the response itself costs money. Investigators, tracing, freezing funds, new keys. Coverage E pays those bills, even for close calls that never lost a dollar but deserve a look.',
    covered: [
      'Forensic investigation of the agent and the chain data.',
      'Tracing and recovery work, including approved bounties and legal freezes.',
      'Emergency key swaps and redeployment.',
      'Telling the people who need to be told.',
      'Looking into close calls, like a blocked attack or a triggered kill switch.',
    ],
    notCovered: [
      'Costs beyond this coverage\u2019s limit. Recovery and bounty spending has its own smaller cap inside it.',
      'Money you did not earn while the agent was down, unless you added that cover separately.',
      'Damage to your reputation and future profits.',
    ],
    payment:
      'We pay the costs as they come in, up to the limit. Recovery and bounty spending is further capped inside it.',
    acknowledgment: 'I understand Coverage E, its limits, and the response costs it pays.',
  },
];

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

// ---------------------------------------------------------------------------
// Connect flow (this variant's single purchase flow)
//
// Landing card → agent picker modal → processing → connected agents →
// quote → payment choice → coverage disclosures A to F → signature.
// All user-facing flow strings live here so the flow copy test can enforce
// the punctuation rules (no colons, semicolons, or dashes in this copy).
// ---------------------------------------------------------------------------

export const FLOW_COPY = {
  landingSub: 'Connect your agents to see what cover they qualify for.',
  connectCard: 'Connect with AgentConnect',
  modalTitle: 'Connect your agents',
  modalSub: 'Select the agents to bring under cover.',
  modalCancel: 'Cancel',
  modalSelectAll: 'Select all',
  modalClearAll: 'Clear all',
  modalConnect: (n: number) => (n === 1 ? 'Connect 1 agent' : `Connect ${n} agents`),
  modalConnectNone: 'Select an agent',
  processingTitle: 'Reading agent configurations',
  processingSteps: [
    'Reading configuration hashes…',
    'Fetching harness inventories…',
    'Freezing tool manifests…',
    'Checking tier 1 controls…',
    'Pricing controls…',
  ],
  agentsTitle: 'Connected agents',
  agentsSub: 'AgentConnect read each agent’s configuration. These details set the terms of cover.',
  agentsContinue: 'Continue to quote →',
  agentsLabels: {
    harness: 'Harness',
    model: 'Model endpoint',
    hash: 'Configuration hash',
    tools: 'Tools',
    controls: 'Controls',
    cap: 'Cap',
  },
  agentsAudited: 'audited',
  agentsNoAttestation: 'No attestation',
  quoteTitle: 'Your quote',
  quoteSub: 'Every agent gets its own price, based on the safety controls it runs and how much it is allowed to move.',
  quoteHint: 'Select an agent to see how its price is built and what it is covered for.',
  quoteTotalCover: 'Total cover',
  quoteAnnualPremium: 'Yearly price',
  quoteAccept: 'Accept quote and continue to terms →',
  quoteBExcluded: 'Coverage B excluded',
  quoteRemove: 'Remove agent from quote',
  totalRate: 'Total rate',
  quoteColumns: {
    agent: 'Agent',
    rate: 'Rate',
    premium: 'Yearly price',
  },
  coverMapTitle: 'What this agent is covered for',
  coverMapExcluded: 'excluded',
  coverMapLimitNote: 'Each figure is the most we pay out for a single incident under that coverage.',
  deductibleTitle: 'Your share of each claim',
  deductibleBody:
    'When we pay a claim, a small first slice stays with you. It is the greater of 500 $NEAR or 2% of the loss. You never pay it up front. We simply subtract it from the payout. And if a safety control failed after passing its latest check, we skip your share entirely.',
  limitsTitle: 'How the limits work',
  limitsBody: (capNear: string, capUsd: string) =>
    `This agent has ${capNear} (${capUsd}) of cover for the year. A single incident pays out up to the limit shown for its coverage. Every payout uses up part of the yearly amount. If it runs out, the agent is no longer covered for the rest of the year. You can restore the full amount once for an updated price.`,
  claimsTitle: 'Claims',
  claimsBody:
    'File as many claims as you need. There is no cap on the count. Each incident carries its own share. If several losses trace back to the same root cause, they count as one incident with one limit and one share.',
  payTitle: 'Payment',
  paySub: 'Choose how to pay for the year.',
  payUpfrontTitle: 'Pay upfront',
  payUpfrontBody: 'Pay the yearly price now in $NEAR at the live rate.',
  payStakeTitle: 'Pay with stake',
  payStakeBody: 'Stake $NEAR and let the rewards pay for your cover through the year.',
  payChoose: 'Choose →',
  payRecommended: 'Recommended',
  payStakeCredit: 'Get $1000 in NEAR AI credits',
  payConfirmUpfrontTitle: 'Confirm payment',
  payConfirmStakeTitle: 'Confirm stake',
  payStakeNote:
    'Rewards from your stake pay for the cover as the year runs. The stake stays yours.',
  payStakeEstimate: (stake: string) =>
    `${stake} staked at a 10% reward rate covers the yearly price in full.`,
  payConfirmUpfront: 'Confirm payment →',
  payConfirmStake: 'Confirm stake →',
  payBack: 'Back to payment options',
  payUpfrontTheaterTitle: 'Settling the premium',
  payUpfrontSteps: [
    'Fetching the live rate…',
    'Converting the yearly price…',
    'Debiting the wallet…',
    'Recording the payment…',
  ],
  payStakeTheaterTitle: 'Setting up the stake',
  payStakeSteps: [
    'Locking stake with the programme validator…',
    'Routing rewards to your payment plan…',
    'Recording the funding plan…',
    'Attaching cover…',
  ],
  payLabels: {
    premium: 'Yearly price',
    settlesAs: 'Settles as',
    stake: 'Estimated stake',
  },
  termsProgress: (n: number) => `Part ${n} of 5`,
  termsSub:
    'Let us walk through what your agents are covered for. Your agreement to each part is recorded.',
  termsWhoTitle: 'Who this coverage applies to',
  termsWhoExcludedReason: 'runs without tamper proof logging',
  termsDepletion:
    'One incident pays up to this amount. Every payout also uses up part of the agent’s yearly cover.',
  termsCovered: 'What is covered',
  termsNotCovered: 'What is not covered',
  termsPayment: 'How payouts work',
  termsLimit: 'The most one incident pays',
  termsLimitPerAgent: 'for each agent',
  termsAgree: 'Agree and continue →',
  signTitle: 'Signature',
  signSub: 'One last look, then sign to put your cover in force.',
  signExclusions: 'Never covered, under any part',
  signAck: 'I have reviewed each coverage, the exclusions above, and the yearly price.',
  signStatement:
    'By signing you agree to Coverages A through E as presented and acknowledged, part by part. Cover starts the moment your payment goes through.',
  signButton: 'Sign and make payment →',
  signTheaterTitle: 'Recording the signature',
  signSteps: ['Recording signatures…', 'Preparing the payment…'],
  signLabels: {
    agents: 'Agents',
    cover: 'Total cover',
    premium: 'Annual premium',
  },
} as const;

/** Opening feed line of the detection playback, per scenario. */
export const CLAIM_DEMO_FEED_EVENT: Record<ScenarioId, string> = {
  'S-03': 'The agent initiated a transfer above the cap and the cap check did not fire.',
  'S-09': 'The agent paid a spoofed payee after processing a poisoned catalogue page.',
  'S-17': 'An inbound attachment carried a crafted instruction. The input filter refused the tool call.',
  'S-18': 'Transfers signed with stolen session credentials began leaving controlled addresses.',
  'S-24': 'The agent paid an invoice for goods that were never ordered.',
};
