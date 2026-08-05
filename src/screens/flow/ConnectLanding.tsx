/**
 * Connect flow, step 1 — the landing card and agent picker (route /).
 *
 * A single WalletConnect-style card opens the picker modal. Connecting runs
 * the REAL enrollment machinery (mandate countersign + pricing) per selected
 * agent behind a processing card, then hands off to /flow/agents.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../../components/LatencyTheater';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { FLOW_COPY, POSITIONING_LINE } from '../../data/copy';
import { useStore } from '../../store';
import type { Tier2Control } from '../../store/types';
import { TIER2_CONTROLS } from '../../store/types';
import { enrollAgent, prepareImportedAgent } from '../purchase/enroll';
import {
  CONNECTABLE_AGENT_IDS,
  resetFlowState,
  setSelectedAgentIds,
} from './flowState';

type Phase = 'idle' | 'picking' | 'processing';

/**
 * Each connectable agent carries a distinct, real control profile so the
 * quote itself demonstrates the rate ladder: a clean baseline, single
 * skipped controls, the full ceiling, and (via the seed) a missing
 * attestation. Profiles are applied through the store at connect time, so
 * pricing, the agents screen, and any later claim all read the same state.
 */
const AGENT_CONTROL_PROFILES: Record<string, readonly Tier2Control[]> = {
  'procurement-bot': [],
  'payables-bot': ['hitl'],
  'treasury-bot': ['timelock', 'killSwitch'],
  'refunds-bot': TIER2_CONTROLS,
  'legacy-bot': [],
};

function applyControlProfile(agentId: string): void {
  const s = useStore.getState();
  const agent = s.agents.find((a) => a.id === agentId);
  if (agent === undefined) return;
  for (const control of AGENT_CONTROL_PROFILES[agentId] ?? []) {
    if (agent.controls.tier2[control]) s.setTier2(agentId, control, false);
  }
}

export default function ConnectLanding() {
  const agents = useStore((s) => s.agents);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  // Entering the landing starts a fresh flow.
  useEffect(() => {
    resetFlowState();
  }, []);

  const connectable = CONNECTABLE_AGENT_IDS.map((id) =>
    agents.find((a) => a.id === id),
  ).filter((a): a is NonNullable<typeof a> => a !== undefined);

  const toggle = (id: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const connect = () => {
    const ids = CONNECTABLE_AGENT_IDS.filter((id) => ticked.has(id));
    if (ids.length === 0) return;
    setSelectedAgentIds(ids);
    // Real machinery: the control profile plus a countersigned enrollment so
    // the agent exists as a real policy. What it is covered FOR comes from
    // its AgentConnect settings, evaluated on the walkthrough.
    for (const id of ids) {
      applyControlProfile(id);
      prepareImportedAgent(id);
      enrollAgent(id);
    }
    setPhase('processing');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-16" data-testid="screen-ConnectLanding">
      <div className="mx-auto flex max-w-[460px] flex-col items-center text-center">
        <img src="/near-symbol.svg" alt="" className="h-9 w-9" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">
          {POSITIONING_LINE}
        </h1>
        <p className="mt-2 text-md text-muted">{FLOW_COPY.landingSub}</p>

        {phase === 'processing' ? (
          <LatencyTheater
            className="mt-8 w-full text-left"
            title={FLOW_COPY.processingTitle}
            steps={FLOW_COPY.processingSteps.map((label) => ({ label }))}
            totalMs={3600}
            onDone={() => navigate('/flow/review/1')}
          />
        ) : (
          <button
            type="button"
            data-testid="connect-card"
            onClick={() => setPhase('picking')}
            className="mt-8 flex w-full items-center justify-between gap-3 rounded-card border border-line bg-panel px-5 py-4 text-left shadow-card"
          >
            <span className="text-sm font-semibold text-ink">
              {FLOW_COPY.connectCard}
            </span>
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent text-sm font-bold text-ink">
              →
            </span>
          </button>
        )}
      </div>

      {phase === 'picking' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
          data-testid="connect-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-[420px] rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-md font-semibold text-ink">{FLOW_COPY.modalTitle}</h2>
                <p className="mt-0.5 text-xs text-muted">{FLOW_COPY.modalSub}</p>
              </div>
              <SimulatedBadge />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                data-testid="flow-select-all"
                onClick={() =>
                  setTicked(
                    ticked.size === connectable.length
                      ? new Set()
                      : new Set(connectable.map((a) => a.id)),
                  )
                }
                className="text-2xs font-semibold text-accent-ink"
              >
                {ticked.size === connectable.length
                  ? FLOW_COPY.modalClearAll
                  : FLOW_COPY.modalSelectAll}
              </button>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {connectable.map((agent) => {
                const on = ticked.has(agent.id);
                return (
                  <li key={agent.id}>
                    <button
                      type="button"
                      data-testid={`flow-agent-${agent.id}`}
                      aria-pressed={on}
                      onClick={() => toggle(agent.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                        on ? 'border-accent-line bg-accent-soft' : 'border-line bg-panel'
                      }`}
                    >
                      <span
                        className={`flex h-4.5 w-4.5 h-[18px] w-[18px] flex-none items-center justify-center rounded border text-[11px] font-bold ${
                          on
                            ? 'border-accent bg-accent text-ink'
                            : 'border-line text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm text-ink">
                          {agent.name}
                        </span>
                        <span className="block text-2xs text-faint">
                          {agent.harness.name} {agent.harness.version}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                data-testid="flow-cancel"
                onClick={() => setPhase('idle')}
                className="text-sm font-semibold text-muted"
              >
                {FLOW_COPY.modalCancel}
              </button>
              <button
                type="button"
                data-testid="flow-connect"
                disabled={ticked.size === 0}
                onClick={connect}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
              >
                {ticked.size === 0
                  ? FLOW_COPY.modalConnectNone
                  : FLOW_COPY.modalConnect(ticked.size)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
