/**
 * The recommended NEAR stack and how it sizes each agent's cover.
 *
 * Nothing here is declared by hand. The harness comes from the agent's
 * registered configuration, and near.com banking and NEAR Intents transfers
 * are detected from the connectors in the agent's frozen tool manifest, the
 * same manifest the connect processing reads. The resulting cap is written
 * into the agent's mandate at connect time, so pricing, limits, and payouts
 * all follow it through the real engine.
 */
import type { Agent, ToolManifestEntry } from '../../store/types';

export const CAP_BASE_USD = 15_000;
export const CAP_IRONCLAW_USD = 15_000;
export const CAP_NEARBANK_USD = 10_000;
export const CAP_INTENTS_USD = 10_000;

export function runsIronClaw(agent: Agent): boolean {
  return agent.harness.name === 'IronClaw';
}

function findTool(agent: Agent, prefix: string): ToolManifestEntry | undefined {
  return agent.toolManifest.find((t) => t.name.startsWith(prefix));
}

export function nearBankTool(agent: Agent): ToolManifestEntry | undefined {
  return findTool(agent, 'nearcom.');
}

export function intentsTool(agent: Agent): ToolManifestEntry | undefined {
  return findTool(agent, 'intents.');
}

/** The cover amount an agent qualifies for on its current stack. */
export function recommendedCapUsd(agent: Agent): number {
  return (
    CAP_BASE_USD +
    (runsIronClaw(agent) ? CAP_IRONCLAW_USD : 0) +
    (nearBankTool(agent) !== undefined ? CAP_NEARBANK_USD : 0) +
    (intentsTool(agent) !== undefined ? CAP_INTENTS_USD : 0)
  );
}

export interface StackRow {
  key: 'ironclaw' | 'nearBank' | 'intents';
  on: boolean;
  addUsd: number;
  /** What was actually found, e.g. the harness build or the manifest entry. */
  evidence?: string;
}

export function stackRows(agent: Agent): StackRow[] {
  const bank = nearBankTool(agent);
  const intents = intentsTool(agent);
  return [
    {
      key: 'ironclaw',
      on: runsIronClaw(agent),
      addUsd: CAP_IRONCLAW_USD,
      // The registered harness always names what the agent actually runs.
      evidence: `${agent.harness.name} ${agent.harness.version}`,
    },
    {
      key: 'nearBank',
      on: bank !== undefined,
      addUsd: CAP_NEARBANK_USD,
      evidence: bank !== undefined ? `${bank.name} ${bank.version}` : undefined,
    },
    {
      key: 'intents',
      on: intents !== undefined,
      addUsd: CAP_INTENTS_USD,
      evidence: intents !== undefined ? `${intents.name} ${intents.version}` : undefined,
    },
  ];
}
