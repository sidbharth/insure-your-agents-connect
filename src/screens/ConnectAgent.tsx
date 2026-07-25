/**
 * Screen 7.3 — Connect your agent (WP-2; mockups wizard-connect-*.html).
 *
 * "Connect from endpoint" (paste URL) or "Use a sample agent" (default
 * Procurement-Bot from seed) → progress card via LatencyTheater (manifest →
 * harness/model → configuration hash → registering) → agent identity card
 * naming what the fingerprint covers (REQ-7.3.1) with expandable frozen tool
 * manifest and the off-list-tool tooltip (uncovered + configuration breach,
 * D3.4/S-11) → MANDATORY ownership challenge with the signature-over-code
 * explainer (REQ-7.3.2). Simulated badges on registration and signature
 * (REQ-6.5).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { configHash, shortHash } from '../lib/hash';
import { demoNow } from '../lib/demoClock';
import { WIZARD_AGENT, createDefaultMandate } from '../data/seed';
import { useStore } from '../store';
import type { Agent } from '../store/types';
import {
  challengeNonce,
  formatUtcStamp,
  signingKeyLabel,
} from './wizard/format';
import { getWizardAgentId, setWizardAgentId } from './wizard/wizardAgent';
import { WizardBack, WizardStepper } from './wizard/Stepper';

type Phase = 'pick' | 'registering' | 'identity' | 'challenging' | 'verified';

function registrationSteps(name: string, toolCount: number) {
  return [
    { label: `Fetching tool manifest (${toolCount} tools declared)` },
    { label: `Reading harness and model info (${name})` },
    { label: 'Computing configuration hash…' },
    { label: 'Anchoring hash to registry' },
  ];
}

const CHALLENGE_STEPS = [
  { label: 'Generating one-time challenge code' },
  { label: 'Sending challenge to agent endpoint' },
  { label: 'Agent signing with its registered key…' },
  { label: 'Matching signature against registered identity' },
];

export default function ConnectAgent() {
  const navigate = useNavigate();
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const registerAgent = useStore((s) => s.registerAgent);
  const markOwnershipVerified = useStore((s) => s.markOwnershipVerified);
  const saveMandate = useStore((s) => s.saveMandate);
  const mandates = useStore((s) => s.mandates);
  const setAgentStatus = useStore((s) => s.setAgentStatus);

  // An agent with a live enrollment is already in the order. Arriving here
  // then means connecting a fresh agent, so the picker starts over.
  const taken = (id: string) =>
    enrollments.some((e) => e.agentId === id && e.terminatedAt === undefined);

  const wizardAgent = agents.find((a) => a.id === getWizardAgentId());
  const [phase, setPhase] = useState<Phase>(() => {
    if (!wizardAgent || taken(wizardAgent.id)) return 'pick';
    if (wizardAgent.ownershipVerified) return 'verified';
    if (wizardAgent.status === 'Quoted') return 'identity';
    return 'pick';
  });
  const [endpointUrl, setEndpointUrl] = useState('');
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null);
  const [manifestOpen, setManifestOpen] = useState(false);
  const [registeredAt, setRegisteredAt] = useState<number | undefined>(undefined);
  const [signedAt, setSignedAt] = useState<number | undefined>(undefined);

  // The offered sample: the default agent while free, then the next
  // unenrolled seeded agent.
  const defaultSample = agents.find((a) => a.id === WIZARD_AGENT.id);
  const sample =
    defaultSample && !taken(defaultSample.id) && !defaultSample.ownershipVerified
      ? defaultSample
      : agents.find((a) => a.status === 'Draft');
  const template = sample ?? defaultSample ?? agents[0];
  const activeAgent =
    phase === 'pick' ? null : (agents.find((a) => a.id === getWizardAgentId()) ?? null);

  const nonce = useMemo(
    () => challengeNonce(activeAgent?.id ?? WIZARD_AGENT.id),
    [activeAgent?.id],
  );

  const connectSample = () => {
    if (!sample) return;
    setWizardAgentId(sample.id);
    setPendingAgent(sample);
    setPhase('registering');
  };

  const connectEndpoint = () => {
    const url = endpointUrl.trim();
    if (url.length === 0) return;
    const slug =
      url
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'endpoint-agent';
    const id = `endpoint-${slug}`;
    const agent: Agent = {
      ...(template as Agent),
      id,
      name: `Agent @ ${url.replace(/^https?:\/\//, '')}`,
      configHash: configHash(`${url}|endpoint-manifest-v1`),
      modelEndpointId: url,
      attestation: { available: true, endpoint: `${url}/attest` },
      ownershipVerified: false,
      status: 'Draft',
    };
    setWizardAgentId(id);
    setPendingAgent(agent);
    setPhase('registering');
  };

  const finishRegistration = () => {
    if (pendingAgent) {
      registerAgent({ ...pendingAgent, status: 'Quoted' });
      if (!mandates[pendingAgent.id] || mandates[pendingAgent.id].length === 0) {
        saveMandate(pendingAgent.id, createDefaultMandate());
      }
      setRegisteredAt(demoNow());
    }
    setPhase('identity');
  };

  const finishChallenge = () => {
    if (activeAgent) {
      markOwnershipVerified(activeAgent.id);
      setAgentStatus(activeAgent.id, 'Quoted');
      setSignedAt(demoNow());
    }
    setPhase('verified');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-ConnectAgent">
      <WizardStepper current="agent" className="mb-3" />
      <WizardBack
        to="/verify"
        note="Going back keeps your verification and any registered agent."
        warn={
          phase === 'registering' || phase === 'challenging'
            ? 'A step is still in progress. Going back cancels it and it will need to be rerun. Go back anyway?'
            : undefined
        }
        className="mb-5"
      />

      <div className="mx-auto max-w-[760px]">
        <h1 className="text-xl font-bold text-ink">Connect your agent</h1>
        <p className="mt-2 text-sm text-muted">
          Connecting an agent involves two steps: registering its
          configuration fingerprint and verifying that you control it.
        </p>

        {phase === 'pick' && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-card border border-line bg-panel p-5 shadow-card">
                <div className="text-sm font-semibold text-ink">Connect from endpoint</div>
                <p className="mt-1 text-xs text-muted">
                  We fetch the manifest and fingerprint it.
                </p>
                <input
                  data-testid="endpoint-url"
                  placeholder="https://agents.example.com/procurement"
                  className="mt-3 w-full rounded-md border border-line px-2.5 py-1.5 font-mono text-xs text-ink"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                />
                <button
                  type="button"
                  data-testid="connect-endpoint"
                  disabled={endpointUrl.trim().length === 0}
                  onClick={connectEndpoint}
                  className="mt-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-40"
                >
                  Connect endpoint
                </button>
              </div>
              <div className="rounded-card border border-accent-line bg-panel p-5 shadow-card">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  Use a sample agent
                  <span className="rounded bg-accent-soft px-1.5 py-px text-2xs font-bold text-accent-ink">
                    Recommended
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Start with a pre-configured agent and its tool manifest.
                </p>
                {sample ? (
                  <>
                    <div className="mt-3 rounded-md border border-line bg-canvas px-3 py-2.5">
                      <div className="text-sm font-semibold text-ink">{sample.name}</div>
                      <p className="mt-0.5 text-2xs text-muted">
                        Preconfigured sample agent with a standard tool
                        manifest. Suggested cap $50,000.
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="connect-sample"
                        onClick={connectSample}
                        className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-ink hover:bg-[#0bd489]"
                      >
                        Connect {sample.name}
                      </button>
                      <SimulatedBadge />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    Every sample agent is already enrolled. Connect a new agent
                    from an endpoint.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'registering' && pendingAgent && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              Registering {pendingAgent.name}… <SimulatedBadge />
            </div>
            <LatencyTheater
              steps={registrationSteps(
                `${pendingAgent.harness.name} ${pendingAgent.harness.version}`,
                pendingAgent.toolManifest.length,
              )}
              onDone={finishRegistration}
            />
            <p className="mt-3 text-xs text-muted">
              The fingerprint covers the harness code, the system prompt, the
              tool manifest, and the model endpoint. If any of these change,
              the fingerprint changes. The policy insures the fingerprinted
              agent.
            </p>
          </div>
        )}

        {(phase === 'identity' || phase === 'challenging' || phase === 'verified') &&
          activeAgent && (
            <div className="mt-6 space-y-4">
              {/* Agent identity card (REQ-7.3.1) */}
              <div
                data-testid="agent-identity-card"
                className="rounded-card border border-line bg-panel p-5 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                    Agent identity
                  </div>
                  <span className="rounded bg-good-bg px-1.5 py-px text-2xs font-bold text-good">
                    Hash registered
                  </span>
                  <SimulatedBadge />
                  <span className="num ml-auto text-2xs text-faint">
                    Registered {formatUtcStamp(registeredAt ?? demoNow())}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                      Agent name
                    </div>
                    <div className="font-semibold text-ink">{activeAgent.name}</div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                      Configuration hash
                    </div>
                    <div className="font-mono text-sm text-ink" data-testid="agent-short-hash">
                      {shortHash(activeAgent.configHash)}
                    </div>
                    <div className="text-2xs text-faint" data-testid="fingerprint-covers">
                      Covers the harness code, system prompt, tool manifest,
                      and model endpoint.
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                      Harness
                    </div>
                    <div className="text-ink">
                      {activeAgent.harness.name}{' '}
                      <span className="num">{activeAgent.harness.version}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                      Model endpoint
                    </div>
                    <div className="font-mono text-xs text-ink">
                      {activeAgent.modelEndpointId}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                      Attestation
                    </div>
                    <div
                      className={
                        activeAgent.attestation.available ? 'text-good' : 'text-warn'
                      }
                      data-testid="attestation-status"
                    >
                      {activeAgent.attestation.available
                        ? 'TEE attestation available'
                        : 'No attestation available'}
                    </div>
                  </div>
                </div>

                {/* expandable frozen tool manifest + off-list tooltip */}
                <button
                  type="button"
                  data-testid="manifest-toggle"
                  aria-expanded={manifestOpen}
                  onClick={() => setManifestOpen((v) => !v)}
                  className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-accent-ink"
                >
                  <span>{manifestOpen ? '▲' : '▼'}</span>
                  Tool manifest ({activeAgent.toolManifest.length})
                </button>
                {manifestOpen && (
                  <div className="mt-2 overflow-hidden rounded-md border border-line" data-testid="tool-manifest">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-canvas text-2xs uppercase tracking-wider text-faint">
                        <tr>
                          <th className="px-3 py-1.5">Tool</th>
                          <th className="px-3 py-1.5">Publisher</th>
                          <th className="px-3 py-1.5">Permissions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAgent.toolManifest.map((tool) => (
                          <tr key={tool.name} className="border-t border-line-soft">
                            <td className="px-3 py-1.5 font-mono">{tool.name}</td>
                            <td className="px-3 py-1.5">{tool.publisher}</td>
                            <td className="px-3 py-1.5 text-muted">
                              {tool.permissions.join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ownership challenge — mandatory (REQ-7.3.2) */}
              {phase === 'identity' && (
                <div
                  data-testid="ownership-challenge"
                  className="rounded-card border border-line bg-panel p-5 shadow-card"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    Verify control <SimulatedBadge />
                  </div>
                  <p className="mt-2 text-sm text-muted" data-testid="challenge-explainer">
                    Your agent signs a random one-time code with its key. If
                    the signature matches its registered identity, control is
                    confirmed. Whoever controls the signing key controls the
                    agent.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="send-challenge"
                      onClick={() => setPhase('challenging')}
                      className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
                    >
                      Send challenge
                    </button>
                    <span className="num font-mono text-2xs text-faint">nonce {nonce}</span>
                  </div>
                </div>
              )}

              {phase === 'challenging' && (
                <LatencyTheater
                  title="Ownership challenge in progress…"
                  steps={CHALLENGE_STEPS}
                  onDone={finishChallenge}
                />
              )}

              {phase === 'verified' && (
                <div
                  data-testid="signature-verified"
                  className="rounded-card border border-good-line bg-good-bg p-5"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-good">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-good text-xs font-bold text-white">
                      ✓
                    </span>
                    Signature verified. Control of this agent confirmed.
                    <SimulatedBadge className="ml-auto" />
                  </div>
                  <p className="num mt-2 font-mono text-xs text-good">
                    Challenge {nonce} signed by key {signingKeyLabel(activeAgent.id)},
                    matching registered identity {shortHash(activeAgent.configHash)}
                    {signedAt !== undefined && <>, {formatUtcStamp(signedAt)}</>}
                  </p>
                  <button
                    type="button"
                    data-testid="connect-continue"
                    onClick={() => navigate('/mandate')}
                    className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
                  >
                    Continue to mandate
                  </button>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
