/**
 * Principal journey (role = principal): review the agent and mandate the
 * Operator prepared, then countersign (D2.5). The Principal does not pay the
 * premium. As an enrolled insured (T2.2), the Principal's losses are paid
 * directly to it (T8.4). Cover attaches once the Operator completes controls
 * and payment (T2.3, Acceptance clause).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { S31_NOTE } from '../data/copy';
import { createDefaultMandate, WIZARD_AGENT } from '../data/seed';
import { shortHash } from '../lib/hash';
import { formatUsd } from '../lib/money';
import { useStore } from '../store';
import { formatUtcStamp } from './wizard/format';
import { setWizardAgentId } from './wizard/wizardAgent';
import { WizardBack, WizardStepper } from './wizard/Stepper';

type Phase = 'review' | 'signing' | 'done';

const SIGN_STEPS = [
  { label: 'Preparing mandate for signature' },
  { label: 'Recording your countersignature' },
  { label: 'Notifying the Operator' },
];

export default function PrincipalReview() {
  const navigate = useNavigate();
  const operatorName = useStore((s) => s.operator.name);
  const agents = useStore((s) => s.agents);
  const mandates = useStore((s) => s.mandates);
  const enrollments = useStore((s) => s.enrollments);
  const registerAgent = useStore((s) => s.registerAgent);
  const saveMandate = useStore((s) => s.saveMandate);
  const countersignMandate = useStore((s) => s.countersignMandate);

  // The Operator's prepared enrollment: the sample agent and its default
  // mandate, registered on entry if this session has not touched them yet.
  useEffect(() => {
    const s = useStore.getState();
    const existing = s.agents.find((a) => a.id === WIZARD_AGENT.id);
    if (existing && existing.status === 'Draft') {
      s.registerAgent({ ...existing, status: 'Quoted' });
    }
    if (!s.mandates[WIZARD_AGENT.id] || s.mandates[WIZARD_AGENT.id].length === 0) {
      s.saveMandate(WIZARD_AGENT.id, createDefaultMandate());
    }
    setWizardAgentId(WIZARD_AGENT.id);
    // registerAgent/saveMandate identities are stable store actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAgent, saveMandate]);

  const agent = agents.find((a) => a.id === WIZARD_AGENT.id);
  const versions = mandates[WIZARD_AGENT.id] ?? [];
  const mandate = versions[versions.length - 1];
  const countersigned = mandate?.countersigned !== undefined;
  const enrollment = enrollments.find(
    (e) => e.agentId === WIZARD_AGENT.id && e.terminatedAt === undefined,
  );
  const coverActive = enrollment !== undefined && enrollment.effectiveAt !== 0;

  const [phase, setPhase] = useState<Phase>(countersigned ? 'done' : 'review');

  const finishSigning = () => {
    countersignMandate(WIZARD_AGENT.id, undefined, operatorName);
    setPhase('done');
  };

  if (!agent || !mandate) {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-PrincipalReview">
        <p className="text-sm text-muted">Preparing the review…</p>
      </div>
    );
  }

  const familiesOn = Object.entries(mandate.actionFamilies)
    .filter(([, on]) => on)
    .map(([k]) => k).length;

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-PrincipalReview">
      <WizardStepper
        current={phase === 'done' ? 'confirm' : 'review'}
        flow="principal"
        className="mb-3"
      />
      <WizardBack to="/verify" note="Going back keeps your verification." className="mb-5" />

      {phase !== 'done' ? (
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-xl font-bold text-ink">Review and countersign the mandate</h1>
          <p className="mt-2 text-sm text-muted">
            {operatorName} runs this agent and has taken out the policy. Your
            countersignature confirms that the delegation, its caps, and its
            autonomy settings are what you intend. Without it, no cover
            attaches to this agent.
          </p>

          {/* Agent prepared by the Operator */}
          <div className="mt-6 rounded-card border border-line bg-panel p-5 shadow-card" data-testid="principal-agent-card">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                Covered agent
              </div>
              <span className="rounded bg-good-bg px-1.5 py-px text-2xs font-bold text-good">
                Hash registered
              </span>
              <SimulatedBadge />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                  Agent
                </div>
                <div className="font-semibold text-ink">{agent.name}</div>
                <div className="num font-mono text-xs text-muted">
                  {shortHash(agent.configHash)}
                </div>
              </div>
              <div>
                <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
                  Operated by
                </div>
                <div className="text-ink">{operatorName}</div>
                <div className="text-xs text-muted">
                  Harness {agent.harness.name} {agent.harness.version}
                </div>
              </div>
            </div>
          </div>

          {/* Mandate summary */}
          <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card" data-testid="principal-mandate-summary">
            <h2 className="text-md font-semibold text-ink">
              Mandate v{mandate.version}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Delegated action families</div>
                <div className="num mt-0.5 text-sm text-ink">{familiesOn} of 6</div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Per-transaction cap</div>
                <div className="num mt-0.5 text-sm text-ink">{formatUsd(mandate.caps.perTx)}</div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Approved payees</div>
                <div className="num mt-0.5 text-sm text-ink">
                  {mandate.whitelist.entries.length} on the whitelist
                </div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Human approval above</div>
                <div className="num mt-0.5 text-sm text-ink">{formatUsd(mandate.hitl.threshold)}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted" data-testid="principal-s31-note">
              {S31_NOTE}
            </p>
          </div>

          {/* What the Principal is protected for */}
          <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card" data-testid="principal-protections">
            <h2 className="text-md font-semibold text-ink">Your position under the policy</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-body">
              <li>
                You are an insured under this policy, alongside the Operator.
              </li>
              <li>
                Losses to your assets under Coverages A to D and F are paid
                directly to you at your verified address. That obligation is not
                affected by the Operator&rsquo;s insolvency.
              </li>
              <li>
                Liability claims from counterparties are covered jointly with
                the Operator under Coverage E.
              </li>
              <li>The Operator pays the premium. Nothing is charged to you.</li>
            </ul>
          </div>

          {phase === 'review' && (
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                data-testid="principal-countersign"
                onClick={() => setPhase('signing')}
                className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
              >
                Countersign mandate v{mandate.version}
              </button>
              <SimulatedBadge />
            </div>
          )}

          {phase === 'signing' && (
            <LatencyTheater
              className="mt-5"
              title={`Countersigning as ${operatorName}`}
              steps={SIGN_STEPS}
              onDone={finishSigning}
            />
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-[760px]">
          <div className="rounded-card border border-good-line bg-good-bg p-6 shadow-card" data-testid="principal-done">
            <h1 className="text-lg text-good">Mandate countersigned</h1>
            <p className="num mt-2 text-sm text-good">
              Mandate v{mandate.version} for {agent.name}, signed by{' '}
              {mandate.countersigned?.by}
              {mandate.countersigned && <>, {formatUtcStamp(mandate.countersigned.at)}</>}{' '}
              <SimulatedBadge />
            </p>
            <p className="mt-3 max-w-2xl text-sm text-body" data-testid="principal-cover-status">
              {coverActive
                ? 'Cover is active for this agent. Your countersigned mandate is part of the policy schedule.'
                : 'Your countersignature is recorded. Cover attaches once the Operator completes the safety controls and pays the premium.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/coverage"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
              >
                View coverage
              </Link>
              <Link
                to="/claim"
                className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink"
              >
                Claims
              </Link>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-muted"
              >
                Back to start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
