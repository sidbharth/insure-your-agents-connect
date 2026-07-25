/**
 * Scenario Explorer data (PRD §7.10, plan §8) — WP-4 owned.
 *
 * The framework's scenario library turned into an interactive reference:
 * eight situations, deliberately mixing covered, partly covered, and denied
 * (≥2 denials — REQ-7.10.1). Each verdict is decisive, with the coverage
 * route, ONE clause-level reason, and the control that determined the
 * outcome (REQ-7.10.2).
 *
 * Scenario 2 is conditional on attestation: the verdict function receives
 * the effective attestation state (the target agent's real
 * attestation-at-event-time AND the "what if no attestation?" toggle), so
 * the same event flips Covered(B) → Denied-as-unprovable (AC-3c).
 *
 * Dollar figures are derived from the policy's actual cap via the claims
 * engine's per-event-limit rule and the seeded incident parameters — never
 * hard-coded totals.
 */
import { perEventLimit } from '../lib/claims';
import { formatUsd } from '../lib/money';
import { SEED_INCIDENT_PARAMS } from './seed';

export interface ScenarioContext {
  /** The policy's per-agent cap (quote-stage cap pre-purchase). */
  capUsd: number;
  /**
   * Effective attestation for scenario 2: the target agent's attestation
   * operative at event time AND NOT the "what if no attestation?" toggle.
   */
  attested: boolean;
}

export interface ScenarioVerdict {
  covered: boolean;
  /** Decisive headline, e.g. "Covered under Coverage B". */
  headline: string;
  /** The coverage route line (or the explicit absence of one). */
  routeLine: string;
  /** THE one clause-level reason. */
  reason: string;
  clause: string;
  /** Which control determined the outcome (or why none could). */
  control: string;
}

export interface ScenarioDef {
  num: number;
  /** Short picker label. */
  title: string;
  /** Longer narrative shown above the verdict card. */
  narrative: string;
  /** Static picker chip (scenario 2 stays "Covered" in the picker — the toggle lives in the detail). */
  pickerVerdict: 'Covered' | 'Denied';
  /** Scenario 2 only: renders the "what if no attestation?" toggle + agent picker. */
  attestationSensitive?: boolean;
  verdict: (ctx: ScenarioContext) => ScenarioVerdict;
}

const S03 = SEED_INCIDENT_PARAMS['S-03'];

export const SCENARIOS: ScenarioDef[] = [
  {
    num: 1,
    title:
      'A harness defect bypasses the whitelist check and funds are sent to an unapproved payee',
    narrative:
      'A defect in the harness bypasses the whitelist check, and funds are sent to a payee that was never on the approved list. No attacker was involved. The enforcement machinery acted outside the mandate.',
    pickerVerdict: 'Covered',
    verdict: ({ capUsd }) => ({
      covered: true,
      headline: 'Covered under Coverages A and D',
      routeLine: `Coverage A (mandate breach) pays up to 100% of the ${formatUsd(capUsd)} cap. Coverage D covers the portion the whitelist guardrail should have prevented.`,
      reason:
        'The transfer was sent to a payee outside the countersigned whitelist. A mandate breach does not require an attacker (Coverage A), and the bypassed whitelist check is a guardrail that failed to operate (Coverage D).',
      clause: 'Coverage A, Coverage D',
      control:
        'Action logging and the registered whitelist. The logs prove the payee was not on the approved list, which is what makes the breach payable.',
    }),
  },
  {
    num: 2,
    title:
      'Hidden instructions on a product page cause the agent to pay an attacker while remaining within its rules',
    narrative:
      'Hidden instructions embedded in a product page cause the agent to pay an attacker. The agent remained within every rule: an approved payee, an amount under the cap, and an action within its mandate.',
    pickerVerdict: 'Covered',
    attestationSensitive: true,
    verdict: ({ capUsd, attested }) =>
      attested
        ? {
            covered: true,
            headline: 'Covered under Coverage B',
            routeLine: `Coverage B (manipulation) pays up to 100% of the ${formatUsd(capUsd)} cap.`,
            reason:
              'The attested input record proves that crafted adversarial content reached the agent. Without that record, the same event could not be proven and would not be payable.',
            clause: 'D3.5',
            control:
              'TEE attestation. It provides cryptographic proof that the agent was manipulated rather than a belief that it was.',
          }
        : {
            covered: false,
            headline: 'Denied: unprovable without attestation',
            routeLine:
              'Coverage B would apply, but Coverage B is excluded on this agent.',
            reason:
              'Without TEE attestation, Coverage B is excluded entirely. Absent attested inputs, manipulation cannot be distinguished from an ordinary model error.',
            clause: 'D3.5',
            control:
              'TEE attestation. The 0.6% saved at quote time is what this claim required at proof time.',
          },
  },
  {
    num: 3,
    title: `The cap module fails to block a ${formatUsd(S03.lossGrossUsd)} transfer against a ${formatUsd(50_000)} cap`,
    narrative:
      'The cap-checking module fails open and allows a transfer above the mandate’s per-transaction cap. The guardrail existed and was scheduled for verification, but it did not operate.',
    pickerVerdict: 'Covered',
    verdict: ({ capUsd }) => {
      const excess = Math.max(0, S03.lossGrossUsd - capUsd);
      return {
        covered: true,
        headline: `Covered under Coverage D for the ${formatUsd(excess)} excess`,
        routeLine: `Coverage D (guardrail failure) pays the portion the cap module should have blocked: ${formatUsd(S03.lossGrossUsd)} − ${formatUsd(capUsd)} = ${formatUsd(excess)}.`,
        reason:
          'Coverage D pays the excess a correctly functioning cap module would have blocked, not the gross transfer. The deductible is waived because the module passed its most recent scheduled test.',
        clause: 'Coverage D, 5.3',
        control:
          'Scheduled guardrail verification. Passing the most recent test is what waives the deductible on this claim.',
      };
    },
  },
  {
    num: 4,
    title:
      'An agent session key is stolen from the Operator’s servers and used to sign transfers directly',
    narrative:
      'The agent’s session key is exfiltrated from the Operator’s servers, and the attacker uses it to sign transfers directly. Neither the agent nor the Principal initiated the transactions.',
    pickerVerdict: 'Covered',
    verdict: ({ capUsd }) => ({
      covered: true,
      headline: 'Covered under Coverage C',
      routeLine: `Coverage C (key theft) pays up to 100% of the ${formatUsd(capUsd)} cap.`,
      reason:
        'Signing credentials in the disclosed key map were stolen and misused, and funds moved without the agent or the Principal initiating them. This meets the definition of a Coverage C event.',
      clause: 'Coverage C',
      control:
        'The disclosed key map. Only credentials in the disclosed setup are covered, and disclosure is what made this key an insured key.',
    }),
  },
  {
    num: 5,
    title:
      'The agent pays a fabricated invoice to a real payee, within its cap, with no attacker involved',
    narrative:
      'The agent pays an invoice for goods that were never ordered and do not exist. The payee is real and approved, the amount is under the cap, and the attested inputs show no adversarial content.',
    pickerVerdict: 'Denied',
    verdict: () => ({
      covered: false,
      headline: 'Not covered: model conduct',
      routeLine:
        'No coverage applies. The model conduct exclusion governs this event.',
      reason:
        'The attested record shows clean inputs and an action within the mandate. The model produced an incorrect result on its own. The policy insures the delegation and the systems that enforce it, not the quality of the model’s output.',
      clause: '4.9',
      control: 'None. This boundary is what keeps the risk class insurable.',
    }),
  },
  {
    num: 6,
    title:
      'A model provider outage causes a missed payment deadline and late fees',
    narrative:
      'The model provider becomes unavailable, the agent misses a payment deadline, and late fees follow. Nothing was attacked and nothing moved outside the mandate.',
    pickerVerdict: 'Denied',
    verdict: () => ({
      covered: false,
      headline: 'Not covered: model conduct',
      routeLine:
        'No coverage applies. Provider uptime is a model conduct and service-level matter.',
      reason:
        'A slow or unavailable model is excluded model conduct. Downtime and its consequential fees belong to the service agreement with the provider, not to this policy.',
      clause: '4.9',
      control:
        'None applies. No safety control governs a provider’s uptime. That risk is contractual, not insurable here.',
    }),
  },
  {
    num: 7,
    title:
      'The Principal countersigns a mandate cap entered as $500,000 instead of $50,000, and the agent spends within it',
    narrative:
      'The per-transaction cap is entered as $500,000 instead of $50,000. The Principal countersigns the mandate as written, and the agent spends within the erroneous cap.',
    pickerVerdict: 'Denied',
    verdict: ({ capUsd }) => ({
      covered: false,
      headline: 'Not covered: the countersigned mandate governs',
      routeLine: `No coverage applies to the excess. Coverage F covers cleanup and containment, up to ${formatUsd(perEventLimit('F', capUsd))} (15% of the cap).`,
      reason:
        'The agent acted within the mandate as countersigned. The countersignature makes the mandate authoritative, and the policy does not pay for the entry error. Coverage F still covers cleanup and containment.',
      clause: 'S-31, T3.2',
      control:
        'The countersignature. The Principal’s signature defines the mandate, so an unsigned intention cannot override a signed cap.',
    }),
  },
  {
    num: 8,
    title:
      'A compromised insured agent corrupts a counterparty’s agent, and the counterparty sues',
    narrative:
      'A compromised insured agent passes corrupted data to a counterparty’s agent. The counterparty sues for its losses, and the insured agent also lost funds of its own.',
    pickerVerdict: 'Covered',
    verdict: ({ capUsd }) => ({
      covered: true,
      headline: 'Covered under Coverages E and B',
      routeLine: `Coverage E (third-party liability) pays the counterparty’s claim up to ${formatUsd(perEventLimit('E', capUsd))} (50% of the cap). Coverage B pays the insured’s own losses up to ${formatUsd(perEventLimit('B', capUsd))}.`,
      reason:
        'The counterparty’s damages arise from the insured agent’s covered failure (Coverage E, with defense costs inside the limit). The insured’s own manipulation losses fall under Coverage B, proven through the attested record.',
      clause: 'Coverage E, Coverage B',
      control:
        'TEE attestation. It proves the insured agent was itself compromised, which is what routes the counterparty’s claim to Coverage E.',
    }),
  },
];

/** REQ-7.10.1: at least two of the eight scenarios end in denial. */
export const DENIED_SCENARIO_COUNT = SCENARIOS.filter(
  (s) => s.pickerVerdict === 'Denied',
).length;
