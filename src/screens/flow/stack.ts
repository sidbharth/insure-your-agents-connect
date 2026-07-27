/**
 * The recommended NEAR stack and how it sizes each agent's cover.
 *
 * Cover is a spec sheet, not a flat number. Every agent starts from a base
 * amount, and each recommended NEAR product it runs raises the amount it
 * qualifies for. The harness is read from the agent itself (IronClaw is the
 * recommended harness); banking on near.com and transfers over NEAR Intents
 * are per-agent facts declared here. The resulting cap is written into the
 * agent's mandate at connect time, so pricing, limits, and payouts all
 * follow it through the real engine.
 */
import type { Agent } from '../../store/types';

export const CAP_BASE_USD = 15_000;
export const CAP_IRONCLAW_USD = 15_000;
export const CAP_NEARBANK_USD = 10_000;
export const CAP_INTENTS_USD = 10_000;

export interface StackProfile {
  nearBank: boolean;
  intents: boolean;
}

/** Which non-harness NEAR products each connectable agent uses. */
export const STACK_PROFILES: Record<string, StackProfile> = {
  'procurement-bot': { nearBank: true, intents: true },
  'payables-bot': { nearBank: true, intents: false },
  'treasury-bot': { nearBank: false, intents: true },
  'refunds-bot': { nearBank: false, intents: false },
  'legacy-bot': { nearBank: false, intents: false },
};

export function runsIronClaw(agent: Agent): boolean {
  return agent.harness.name === 'IronClaw';
}

export function stackProfileFor(agentId: string): StackProfile {
  return STACK_PROFILES[agentId] ?? { nearBank: false, intents: false };
}

/** The cover amount an agent qualifies for on its current stack. */
export function recommendedCapUsd(agent: Agent): number {
  const profile = stackProfileFor(agent.id);
  return (
    CAP_BASE_USD +
    (runsIronClaw(agent) ? CAP_IRONCLAW_USD : 0) +
    (profile.nearBank ? CAP_NEARBANK_USD : 0) +
    (profile.intents ? CAP_INTENTS_USD : 0)
  );
}

/** The amount the agent could reach if it adopted everything it is missing. */
export function fullStackCapUsd(): number {
  return CAP_BASE_USD + CAP_IRONCLAW_USD + CAP_NEARBANK_USD + CAP_INTENTS_USD;
}

export interface StackRow {
  key: 'ironclaw' | 'nearBank' | 'intents';
  on: boolean;
  addUsd: number;
}

export function stackRows(agent: Agent): StackRow[] {
  const profile = stackProfileFor(agent.id);
  return [
    { key: 'ironclaw', on: runsIronClaw(agent), addUsd: CAP_IRONCLAW_USD },
    { key: 'nearBank', on: profile.nearBank, addUsd: CAP_NEARBANK_USD },
    { key: 'intents', on: profile.intents, addUsd: CAP_INTENTS_USD },
  ];
}
