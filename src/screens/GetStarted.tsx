/**
 * Screen 7.1 — Get started (WP-2; mockup wizard-landing-default.html).
 * Positioning line, "Get started" CTA → /verify, three-step preview strip,
 * "How it works" 60-second explainer (the four end-user questions), demo
 * small print, and the single-role Operator footnote (REQ-7.1.1). No signup,
 * no email capture (REQ-7.1.2). The session comes pre-seeded from data/seed
 * — the company name is rename-able in place.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { POSITIONING_LINE } from '../data/copy';
import { useStore } from '../store';
import type { EnrollmentRole } from '../store/types';

/** Framework Appendix 1 parties, presented as enrollment roles. */
const ROLES: {
  key: EnrollmentRole;
  title: string;
  definition: string;
  cta: string;
  testId: string;
  highlight?: boolean;
}[] = [
  {
    key: 'operator',
    title: 'Operator',
    definition:
      'You build and run the agents. You choose the model, design the harness, manage the keys, and are responsible for uptime and updates. The Operator takes out the policy and manages it.',
    cta: 'Continue as Operator',
    testId: 'get-started',
    highlight: true,
  },
  {
    key: 'principal',
    title: 'Principal',
    definition:
      'Agents run by an Operator spend your funds. You delegate authority to them and define what they may do. As an enrolled Principal you are an insured under the policy, and your losses are paid directly to you.',
    cta: 'Continue as Principal',
    testId: 'role-principal',
  },
  {
    key: 'both',
    title: 'Operator and Principal',
    definition:
      'One organization builds the agents and owns the funds they spend. You complete the full enrollment and countersign the mandate through your own authorized officer.',
    cta: 'Continue as both',
    testId: 'role-both',
  },
];

const STEPS = [
  {
    n: 1,
    title: 'Prove your company',
    body: 'Verify your legal entity so the programme can pursue recovery on your behalf and stand behind claims.',
  },
  {
    n: 2,
    title: 'Connect your agents',
    body: "Register each agent's configuration fingerprint, sign its rulebook, and choose its safety controls.",
  },
  {
    n: 3,
    title: 'Get covered',
    body: 'See the price and the coverage it buys, pay the premium in $NEAR at the live rate, and cover attaches instantly.',
  },
];

/** The four end-user questions (PRD §2) — the 60-second explainer. */
const HOW_IT_WORKS = [
  {
    q: 'Who is eligible for coverage?',
    a: 'Coverage requires four baseline controls: a registered agent identity, enforced transfer caps, an enforced payee whitelist, and action logging. An agent that lacks any of these is declined rather than charged a higher premium.',
  },
  {
    q: 'How is the premium calculated?',
    a: "The premium starts at a base rate of 0.6% of the agent's per-transaction cap. A published surcharge is added for each optional control that is not in place, and the total rate never exceeds 3.0%. The full calculation behind any figure is available through the Show the math toggle.",
  },
  {
    q: 'What does the policy cover?',
    a: "The policy provides six coverages, labeled A through F, ranging from mandate breaches to cleanup and recovery costs. It does not cover losses caused by an incorrect model decision alone. The policy insures the delegation and the systems that enforce it, not the model's judgment.",
  },
  {
    q: 'What happens when a loss occurs?',
    a: 'You notify the programme within 48 hours of discovery and contain the incident immediately. Most of the twelve-item evidence package is assembled automatically from your own records. Claims are acknowledged within 2 business days, decided within 30 days of a complete package, and paid within 10 days of the decision.',
  },
];

export default function GetStarted() {
  const navigate = useNavigate();
  const operatorName = useStore((s) => s.operator.name);
  const renameOperator = useStore((s) => s.renameOperator);
  const setRole = useStore((s) => s.setRole);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(operatorName);

  // An empty commit falls back to the default company name.
  const commitRename = () => {
    const next = draftName.trim();
    renameOperator(next.length > 0 ? next : 'Acme, Inc');
    setEditingName(false);
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-10" data-testid="screen-GetStarted">
      <div className="mx-auto max-w-[860px]">
        {/* Seeded company — accept or rename (PRD 7.1 system behavior) */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
          {editingName ? (
            <input
              autoFocus
              data-testid="company-name-input"
              className="rounded-md border border-line bg-panel px-2 py-1 text-sm text-ink"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftName(operatorName);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              data-testid="company-name"
              title="Edit company name"
              className="cursor-text font-bold text-ink"
              onClick={() => {
                setDraftName(operatorName);
                setEditingName(true);
              }}
            >
              {operatorName}
            </button>
          )}
        </div>

        <h1 className="max-w-[720px] text-2xl font-bold tracking-tight text-ink">
          {POSITIONING_LINE}
        </h1>
        <p className="mt-3 max-w-[640px] text-md text-muted">
          Verify your company, register an agent, and set its mandate.
        </p>

        {/* Role selection: who is enrolling (framework Appendix 1 parties) */}
        <h2 className="mt-10 text-lg font-semibold text-ink">
          How will you be enrolling?
        </h2>
        <p className="mt-1 max-w-[640px] text-sm text-muted">
          The policy is taken out by the Operator for the benefit of the
          Operator and its enrolled Principals. Select the role that describes
          your organization.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="role-cards">
          {ROLES.map((r) => (
            <div
              key={r.key}
              data-testid={`role-card-${r.key}`}
              className={`flex flex-col rounded-card border bg-panel p-5 shadow-card ${
                r.highlight ? 'border-accent-line' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-md font-semibold text-ink">{r.title}</h3>
                {r.highlight && (
                  <span className="rounded bg-accent-soft px-1.5 py-px text-2xs font-bold text-accent-ink">
                    Policyholder
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-sm text-muted">{r.definition}</p>
              <button
                type="button"
                data-testid={r.testId}
                onClick={() => {
                  setRole(r.key);
                  navigate('/verify');
                }}
                className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold ${
                  r.highlight
                    ? 'bg-accent text-ink hover:bg-[#0bd489]'
                    : 'border border-line bg-panel text-ink hover:bg-canvas'
                }`}
              >
                {r.cta}
              </button>
            </div>
          ))}
        </div>

        {/* How it works: the three-step journey */}
        <h2 className="mt-12 text-lg font-semibold text-ink">How it works</h2>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-3" data-testid="step-strip">
          {STEPS.map((step) => (
            <div key={step.n} className="flex gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
                {step.n}
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{step.title}</div>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* FAQs */}
        <h2 className="mt-12 text-lg font-semibold text-ink">
          Frequently asked questions
        </h2>
        <div
          data-testid="how-it-works"
          className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2"
        >
          {HOW_IT_WORKS.map((item) => (
            <div key={item.q}>
              <div className="text-sm font-semibold text-ink">{item.q}</div>
              <p className="mt-1 text-sm text-muted">{item.a}</p>
            </div>
          ))}
        </div>


      </div>
    </div>
  );
}
