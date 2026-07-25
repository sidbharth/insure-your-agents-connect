/**
 * Connect flow, step 2 — connected agents and their implementation details
 * (route /flow/agents). Fleet-style rows read from real store state.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLOW_COPY } from '../../data/copy';
import { formatUsd } from '../../lib/money';
import { useStore } from '../../store';
import { shortHash } from '../../lib/hash';
import { capUsdFor, controlsSummary } from '../purchase/enroll';
import { getSelectedAgentIds } from './flowState';

export default function FlowAgents() {
  const agents = useStore((s) => s.agents);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();

  // Deep-linking without a connection in progress restarts the flow.
  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);
  if (selected.length === 0) return null;

  const rows = selected
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowAgents">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {FLOW_COPY.agentsTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{FLOW_COPY.agentsSub}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((agent) => (
          <div
            key={agent.id}
            data-testid={`flow-agent-row-${agent.id}`}
            className="rounded-card border border-line bg-panel px-4 py-3.5 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-ink">
                {agent.name}
              </span>
              {agent.harness.audited && (
                <span className="inline-flex rounded border border-good-line bg-good-bg px-1.5 py-px text-2xs font-semibold text-good">
                  {FLOW_COPY.agentsAudited}
                </span>
              )}
              {!agent.controls.tier2.attestation && (
                <span className="inline-flex rounded border border-warn-line bg-warn-bg px-1.5 py-px text-2xs font-semibold text-warn">
                  {FLOW_COPY.agentsNoAttestation}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-6">
              <Cell label={FLOW_COPY.agentsLabels.harness} value={`${agent.harness.name} ${agent.harness.version}`} />
              <Cell label={FLOW_COPY.agentsLabels.model} value={agent.modelEndpointId} mono />
              <Cell label={FLOW_COPY.agentsLabels.hash} value={shortHash(agent.configHash)} mono />
              <Cell label={FLOW_COPY.agentsLabels.tools} value={String(agent.toolManifest.length)} />
              <Cell label={FLOW_COPY.agentsLabels.controls} value={controlsSummary(agent)} />
              <Cell label={FLOW_COPY.agentsLabels.cap} value={formatUsd(capUsdFor(state, agent.id))} mono />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          data-testid="flow-agents-continue"
          onClick={() => navigate('/flow/quote')}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {FLOW_COPY.agentsContinue}
        </button>
      </div>
    </div>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-2xs font-bold uppercase tracking-wider text-faint">{label}</div>
      <div
        className={`mt-0.5 truncate text-xs font-semibold text-ink ${mono ? 'num font-mono' : ''}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
