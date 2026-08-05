/**
 * What each coverage pays for a given agent, derived from its AgentConnect
 * settings.
 *
 * One number per coverage, per agent. There is no separate base cover: an
 * agent earns cover on a coverage by having the settings that make that kind
 * of loss unlikely and provable, checked account by account. An agent whose
 * accounts all qualify earns the full amount. An agent where two of three
 * accounts qualify earns two thirds of it, and the walkthrough names the
 * account and the setting that would close the gap.
 *
 * The requirement per coverage:
 *   A. Wrong payments        a payee list, plus approval or a review delay
 *   B. Tricked agent         tamper proof logging, plus approval on the account
 *   C. Stolen keys           a recovery key with a human contact behind it
 *   D. Safety control failed a transfer limit and a review delay to fail
 *   E. Response costs        always available, this is the investigation cover
 */
import type { CoverageRoute } from '../../store/types';
import { agentAccounts, getSetup, type AgentAccount, type AgentSetup } from './accounts';

/** The most any one agent can earn on a single coverage. */
export const MAX_COVER_USD = 50_000;
/** Response cover is a slice of the agent's amount, as it pays costs. */
export const RESPONSE_SHARE = 0.15;

export type CoverLetter = 'A' | 'B' | 'C' | 'D' | 'E';

/** Display letter to the pricing engine's route (response cover prices on F). */
export const LETTER_ROUTE: Record<CoverLetter, CoverageRoute> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'F',
};

export const COVER_LETTERS: CoverLetter[] = ['A', 'B', 'C', 'D', 'E'];

/** A single requirement, evaluated against one account or the agent itself. */
export interface CheckResult {
  /** What we looked for, in the user's words. */
  label: string;
  pass: boolean;
  /** What we actually found, e.g. "24h" or "not set". */
  found: string;
  /** Settings key the walkthrough can fix in place. */
  fix?: FixTarget;
}

export type FixTarget =
  | { kind: 'account'; accountId: string; setting: 'approval' | 'delay' | 'limit' | 'whitelist' }
  | { kind: 'security'; setting: 'recoveryKey' | 'recoveryContact' | 'tamperProofLogging' };

export interface AccountEvaluation {
  account: AgentAccount;
  qualifies: boolean;
  checks: CheckResult[];
}

export interface CoverageEvaluation {
  letter: CoverLetter;
  /** Accounts that qualify, and the ones that do not. */
  accounts: AccountEvaluation[];
  qualifyingCount: number;
  totalCount: number;
  /** Agent wide checks (recovery, logging) that gate the whole coverage. */
  agentChecks: CheckResult[];
  /** Dollars this agent earns on this coverage. */
  coverUsd: number;
  status: 'full' | 'partial' | 'none';
}

const hours = (h: number) => (h > 0 ? `${h}h` : 'not set');

function approvalCheck(a: AgentAccount): CheckResult {
  return {
    label: 'A person approves transfers',
    pass: a.transferApproval === 'review-required',
    found: a.transferApproval === 'review-required' ? 'review required' : 'not set',
    fix: { kind: 'account', accountId: a.id, setting: 'approval' },
  };
}

function delayCheck(a: AgentAccount): CheckResult {
  return {
    label: 'Transfers wait before they leave',
    pass: a.reviewDelayHours > 0,
    found: hours(a.reviewDelayHours),
    fix: { kind: 'account', accountId: a.id, setting: 'delay' },
  };
}

function limitCheck(a: AgentAccount): CheckResult {
  return {
    label: 'A transfer limit is set',
    pass: a.transferLimitNear > 0,
    found:
      a.transferLimitNear > 0
        ? `${a.transferLimitNear.toLocaleString('en-US')} $NEAR ${a.transferFrequency}`
        : 'not set',
    fix: { kind: 'account', accountId: a.id, setting: 'limit' },
  };
}

function whitelistCheck(a: AgentAccount): CheckResult {
  return {
    label: 'Only approved payees can be paid',
    pass: a.whitelist,
    found: a.whitelist ? 'payee list on' : 'not set',
    fix: { kind: 'account', accountId: a.id, setting: 'whitelist' },
  };
}

/** Per-account requirement for each coverage. */
function accountChecks(letter: CoverLetter, a: AgentAccount): CheckResult[] {
  switch (letter) {
    case 'A':
      // A payee list, and a way to catch a bad payment before it lands.
      return [whitelistCheck(a), approvalCheck(a), delayCheck(a)];
    case 'B':
      return [approvalCheck(a)];
    case 'C':
      return [];
    case 'D':
      return [limitCheck(a), delayCheck(a)];
    case 'E':
      return [];
  }
}

/** Whether one account's checks satisfy the coverage. */
function accountQualifies(letter: CoverLetter, checks: CheckResult[]): boolean {
  if (checks.length === 0) return true;
  if (letter === 'A') {
    const [list, approval, delay] = checks;
    // The payee list is required; either catch mechanism will do.
    return list.pass && (approval.pass || delay.pass);
  }
  return checks.every((c) => c.pass);
}

/** Agent wide requirement for each coverage. */
function agentChecks(letter: CoverLetter, setup: AgentSetup): CheckResult[] {
  const s = setup.security;
  switch (letter) {
    case 'B':
      return [
        {
          label: 'Tamper proof logging is on',
          pass: s.tamperProofLogging,
          found: s.tamperProofLogging ? 'on' : 'not set',
          fix: { kind: 'security', setting: 'tamperProofLogging' },
        },
      ];
    case 'C':
      return [
        {
          label: 'A recovery key is set',
          pass: s.recoveryKey,
          found: s.recoveryKey ? 'set' : 'not set',
          fix: { kind: 'security', setting: 'recoveryKey' },
        },
        {
          label: 'A person is behind that recovery key',
          pass: s.recoveryContact,
          found: s.recoveryContact ? 'connected' : 'not set',
          fix: { kind: 'security', setting: 'recoveryContact' },
        },
      ];
    default:
      return [];
  }
}

export function evaluateCoverage(agentId: string, letter: CoverLetter): CoverageEvaluation {
  const setup = getSetup(agentId);
  const accounts = agentAccounts(agentId);
  const agentLevel = setup === undefined ? [] : agentChecks(letter, setup);
  const agentGateOpen = agentLevel.every((c) => c.pass);

  const evaluations: AccountEvaluation[] = accounts.map((account) => {
    const checks = accountChecks(letter, account);
    return {
      account,
      qualifies: agentGateOpen && accountQualifies(letter, checks),
      checks,
    };
  });

  const totalCount = evaluations.length;
  const qualifyingCount = evaluations.filter((e) => e.qualifies).length;
  const share = totalCount === 0 ? 0 : qualifyingCount / totalCount;
  const base = Math.round((MAX_COVER_USD * share) / 1000) * 1000;
  const coverUsd = letter === 'E' ? Math.round(base * RESPONSE_SHARE) : base;

  return {
    letter,
    accounts: evaluations,
    qualifyingCount,
    totalCount,
    agentChecks: agentLevel,
    coverUsd,
    status: qualifyingCount === 0 ? 'none' : qualifyingCount === totalCount ? 'full' : 'partial',
  };
}

export function evaluateAgent(agentId: string): CoverageEvaluation[] {
  return COVER_LETTERS.map((letter) => evaluateCoverage(agentId, letter));
}

/** The largest single amount an agent earns, used as its headline cover. */
export function agentCoverUsd(agentId: string): number {
  return Math.max(0, ...evaluateAgent(agentId).map((e) => e.coverUsd));
}

/**
 * Yearly price. The base rate is 0.6% of what the agent is covered for, and
 * every coverage that is not fully earned adds 0.1% because we carry more
 * risk on a weaker setup.
 */
export function agentPriceUsd(agentId: string): { ratePct: number; priceUsd: number } {
  const evaluations = evaluateAgent(agentId);
  const gaps = evaluations.filter((e) => e.status !== 'full').length;
  const ratePct = Math.round((0.6 + gaps * 0.1) * 10) / 10;
  const coverUsd = Math.max(0, ...evaluations.map((e) => e.coverUsd));
  return { ratePct, priceUsd: Math.round((ratePct / 100) * coverUsd) };
}
