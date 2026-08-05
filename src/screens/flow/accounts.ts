/**
 * Agent accounts and their safety settings, mirroring AgentConnect.
 *
 * This is the source of truth for what an agent is covered for. Each agent
 * holds named accounts (Checking, Tax, Operations, and so on), and each
 * account carries the settings a user configures in AgentConnect: a review
 * delay before transfers leave, a transfer limit and how often it resets,
 * whether transfers need a person to approve them, and whether the account
 * has a whitelist of allowed payees. Recovery settings sit at the agent
 * level under Security and Recovery.
 *
 * Module level rather than in the store because the frozen store contracts
 * carry no account fields. Settings are mutable at runtime so the coverage
 * walkthrough can fix a gap and recompute cover on the spot.
 */

export type TransferApproval = 'none' | 'review-required';
export type TransferFrequency = 'daily' | 'weekly';

export interface AgentAccount {
  id: string;
  name: string;
  /** Human owned accounts are not agent accounts and never qualify. */
  humanOwned?: boolean;
  /** Hours a transfer waits before it can leave. 0 means no delay. */
  reviewDelayHours: number;
  /** Ceiling per period, in $NEAR. 0 means no limit set. */
  transferLimitNear: number;
  transferFrequency: TransferFrequency;
  transferApproval: TransferApproval;
  /** A list of allowed payees exists on this account. */
  whitelist: boolean;
}

export interface AgentSecurity {
  /** A recovery key is set for the agent. */
  recoveryKey: boolean;
  /** A human account is attached to that recovery key. */
  recoveryContact: boolean;
  /** Tamper proof logging of what the agent saw and did. */
  tamperProofLogging: boolean;
}

export interface AgentSetup {
  accounts: AgentAccount[];
  security: AgentSecurity;
}

const acct = (
  id: string,
  name: string,
  over: Partial<AgentAccount> = {},
): AgentAccount => ({
  id,
  name,
  reviewDelayHours: 0,
  transferLimitNear: 0,
  transferFrequency: 'daily',
  transferApproval: 'none',
  whitelist: false,
  ...over,
});

/**
 * Seeded setups. Each agent tells a different story on the walkthrough, from
 * a fully configured agent through one that qualifies for almost nothing.
 */
function seedSetups(): Record<string, AgentSetup> {
  return {
    // Fully configured: every account qualifies everywhere.
    'procurement-bot': {
      accounts: [
        acct('checking', 'Checking Account', {
          reviewDelayHours: 24,
          transferLimitNear: 2_500,
          transferApproval: 'review-required',
          whitelist: true,
        }),
        acct('tax', 'Tax Account', {
          reviewDelayHours: 48,
          transferLimitNear: 1_400,
          transferFrequency: 'weekly',
          transferApproval: 'review-required',
          whitelist: true,
        }),
        acct('savings', 'Savings Account', { humanOwned: true }),
      ],
      security: { recoveryKey: true, recoveryContact: true, tamperProofLogging: true },
    },
    // Strong on payments, no recovery contact: stolen keys only partly there.
    'payables-bot': {
      accounts: [
        acct('checking', 'Checking Account', {
          reviewDelayHours: 24,
          transferLimitNear: 2_000,
          transferApproval: 'review-required',
          whitelist: true,
        }),
        acct('operations', 'Operations Account', {
          reviewDelayHours: 12,
          transferLimitNear: 900,
          whitelist: true,
        }),
      ],
      security: { recoveryKey: true, recoveryContact: false, tamperProofLogging: true },
    },
    // Mixed: one account fully set up, one with nothing on it.
    'treasury-bot': {
      accounts: [
        acct('checking', 'Checking Account', {
          reviewDelayHours: 24,
          transferLimitNear: 3_000,
          transferApproval: 'review-required',
          whitelist: true,
        }),
        acct('tax', 'Tax Account', { transferLimitNear: 1_200 }),
        acct('operations', 'Operations Account', {
          reviewDelayHours: 6,
          transferLimitNear: 800,
          whitelist: true,
        }),
      ],
      security: { recoveryKey: true, recoveryContact: true, tamperProofLogging: true },
    },
    // Barely configured: the walkthrough has plenty to fix.
    'refunds-bot': {
      accounts: [
        acct('checking', 'Checking Account', { transferLimitNear: 1_000 }),
        acct('operations', 'Operations Account'),
      ],
      security: { recoveryKey: false, recoveryContact: false, tamperProofLogging: true },
    },
    // No tamper proof logging and no recovery at all.
    'legacy-bot': {
      accounts: [
        acct('checking', 'Checking Account', {
          reviewDelayHours: 12,
          transferLimitNear: 500,
          whitelist: true,
        }),
      ],
      security: { recoveryKey: false, recoveryContact: false, tamperProofLogging: false },
    },
  };
}

let setups: Record<string, AgentSetup> = seedSetups();

export function getSetup(agentId: string): AgentSetup | undefined {
  return setups[agentId];
}

/** Accounts the agent actually operates. Human owned accounts never qualify. */
export function agentAccounts(agentId: string): AgentAccount[] {
  return (setups[agentId]?.accounts ?? []).filter((a) => !a.humanOwned);
}

export function updateAccount(
  agentId: string,
  accountId: string,
  patch: Partial<AgentAccount>,
): void {
  const setup = setups[agentId];
  if (setup === undefined) return;
  setups = {
    ...setups,
    [agentId]: {
      ...setup,
      accounts: setup.accounts.map((a) =>
        a.id === accountId ? { ...a, ...patch } : a,
      ),
    },
  };
}

export function updateSecurity(agentId: string, patch: Partial<AgentSecurity>): void {
  const setup = setups[agentId];
  if (setup === undefined) return;
  setups = {
    ...setups,
    [agentId]: { ...setup, security: { ...setup.security, ...patch } },
  };
}

/** Test and reset hook: restore the seeded setups. */
export function resetSetups(): void {
  setups = seedSetups();
}
