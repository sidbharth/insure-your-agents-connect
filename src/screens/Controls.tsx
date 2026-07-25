/**
 * Screen 7.5 — Safety controls (WP-2; mockups wizard-controls-*.html).
 * THE CENTERPIECE: tier-1 gates that DECLINE (never price), tier-2 priced
 * toggles with published surcharges + coverage/coinsurance chips + the
 * "insurer's why" hovers (REQ-7.5.4), and the live QuoteSidebar whose
 * RateLadder animates to the 3.0% ladder ceiling (REQ-7.5.2, AC-4).
 * Any tier-1 gate OFF collapses the sidebar to red DECLINED naming the gate
 * and disables Continue (REQ-7.5.1, AC-2). Attestation OFF greys Coverage B
 * the same instant (REQ-7.5.3, AC-3). The KYB row mirrors the 7.2 company
 * step: an unverified operator prices as KYB-skipped whatever the toggle.
 */
import { useNavigate } from 'react-router-dom';
import { MathValue } from '../components/MathValue';
import { QuoteSidebar } from '../components/QuoteSidebar';
import { isOperatorVerifiedNow } from '../components/UnverifiedBanner';
import { TIER1_DECLINE_COPY, TIER2_COPY } from '../data/copy';
import { formatN, formatUsd, usdToN } from '../lib/money';
import { GATE_LABELS, priceAgent } from '../lib/pricing';
import { useStore } from '../store';
import type { Tier1Gate, Tier2Control } from '../store/types';
import { buildPricingInput, formatUtcStamp, premiumBreakdown } from './wizard/format';
import { getWizardAgentId } from './wizard/wizardAgent';
import { WizardBack, WizardStepper } from './wizard/Stepper';

const TIER1_COPY: { key: Tier1Gate; label: string; desc: string }[] = [
  {
    key: 'hashIdentity',
    label: 'Registered hash identity',
    desc: "The agent's configuration fingerprint is anchored in the registry. The policy insures the fingerprinted agent.",
  },
  {
    key: 'transferCaps',
    label: 'Transfer caps enforced',
    desc: "The harness refuses any transaction over the mandate's caps, deterministically.",
  },
  {
    key: 'whitelist',
    label: 'Whitelist enforced',
    desc: 'Funds can only move to approved payees. New entries wait through the cooling period.',
  },
  {
    key: 'actionLogging',
    label: 'Action logging',
    desc: 'Append-only log of everything the agent does, anchored on-chain every 24h.',
  },
];

/** Tier-2 row descriptions (mockup copy; timelock/HITL fill in live mandate figures). */
function tier2Desc(
  key: Tier2Control,
  m: { timelockThreshold: number; timelockHold: number; hitlThreshold: number },
): string {
  switch (key) {
    case 'attestation':
      return 'A secure enclave produces tamper-proof receipts of what the agent saw and did.';
    case 'kyb':
      return 'Reflects the company step.';
    case 'timelock':
      return `Transfers above ${formatUsd(m.timelockThreshold)} wait ${m.timelockHold} hours so a bad one can be caught and reversed.`;
    case 'recovery':
      return 'A pre-built path to claw funds back: freeze contacts, tracing retainer, key rotation runbook.';
    case 'harnessAudit':
      return 'A third party has audited the guardrail code that enforces the mandate.';
    case 'hitl':
      return `A named person must approve anything over ${formatUsd(m.hitlThreshold)} before the agent acts.`;
    case 'killSwitch':
      return 'Anomaly alerts plus a manual kill switch that halts the agent instantly.';
  }
}

export default function Controls() {
  const navigate = useNavigate();
  const agentId = getWizardAgentId();
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const versions = useStore((s) => s.mandates[agentId]);
  const setTier1 = useStore((s) => s.setTier1);
  const setTier2 = useStore((s) => s.setTier2);
  const verificationHistory = useStore((s) => s.operator.verificationHistory);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  useStore((s) => s.presenter.timeOffsetMs);

  const mandate = versions?.[versions.length - 1];

  if (!agent || !mandate) {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Controls">
        <WizardStepper current="controls" className="mb-6" />
        <p className="text-sm text-muted">
          No agent connected yet. Start at{' '}
          <button
            type="button"
            className="text-accent-ink underline"
            onClick={() => navigate('/connect')}
          >
            Connect your agent
          </button>
          .
        </p>
      </div>
    );
  }

  const operatorVerified = isOperatorVerifiedNow(verificationHistory);
  const openVerified = verificationHistory.find((iv) => iv.verified && iv.to === undefined);
  const pricing = priceAgent(buildPricingInput(agent, mandate, operatorVerified));
  const declined = pricing.kind === 'declined';

  const descInputs = {
    timelockThreshold: mandate.timelock.threshold,
    timelockHold: mandate.timelock.holdHours,
    hitlThreshold: mandate.hitl.threshold,
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Controls">
      <WizardStepper current="controls" className="mb-3" />
      <WizardBack
        to="/mandate"
        note="Changes on this page are saved automatically."
        className="mb-5"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-xl font-bold text-ink">Safety controls</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Four controls are required for eligibility. Seven are optional:
            each skipped control carries a published surcharge, and some reduce
            coverage.
          </p>

          {/* ------------------------------------------------------------ */}
          {/* Tier 1 — required (gates: they decline, they never price)     */}
          {/* ------------------------------------------------------------ */}
          <section
            className="mt-6 rounded-card border border-line bg-panel p-5 shadow-card"
            data-testid="tier1-group"
          >
            <h2 className="text-md font-semibold text-ink">Tier 1: Required controls</h2>
            <p className="mt-0.5 text-xs text-muted">
              Missing any one of these results in a decline.
            </p>

            <div className="mt-3 space-y-2">
              {TIER1_COPY.map((gate) => {
                const locked = gate.key === 'hashIdentity';
                const on = agent.controls.tier1[gate.key];
                return (
                  <div
                    key={gate.key}
                    className={`rounded-md border px-3 py-2.5 ${
                      on ? 'border-line' : 'border-bad-line bg-bad-bg'
                    }`}
                  >
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        data-testid={`gate-${gate.key}`}
                        checked={on}
                        disabled={locked}
                        onChange={(e) => setTier1(agentId, gate.key, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="text-sm font-semibold text-ink">{gate.label}</span>
                          {locked && (
                            <span className="rounded-full border border-good-line bg-good-bg px-2 py-px text-2xs font-semibold text-good">
                              Locked at registration
                            </span>
                          )}
                          <span className="ml-auto rounded-full border border-line bg-canvas px-2 py-px text-2xs font-semibold text-faint">
                            Eligibility gate
                          </span>
                        </span>
                        <span className="mt-0.5 block text-2xs text-faint">{gate.desc}</span>
                        {!on && (
                          <span
                            className="mt-1 block text-xs font-semibold text-bad"
                            data-testid={`gate-off-note-${gate.key}`}
                          >
                            {TIER1_DECLINE_COPY(GATE_LABELS[gate.key])}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Tier 2 — priced choices                                       */}
          {/* ------------------------------------------------------------ */}
          <section
            className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card"
            data-testid="tier2-group"
          >
            <h2 className="text-md font-semibold text-ink">Tier 2: Priced options</h2>
            <p className="mt-0.5 text-xs text-muted">
              Each skipped control carries a published surcharge. Some reduce
              coverage.
            </p>

            <div className="mt-3 space-y-2">
              {TIER2_COPY.map((ctrl) => {
                // Tier2Copy.key is typed string in the frozen copy contract.
                const key = ctrl.key as Tier2Control;
                const toggled = agent.controls.tier2[key];
                const isKyb = key === 'kyb';
                // KYB mirrors the 7.2 company step: unverified prices as skipped.
                const effectiveOn = isKyb ? toggled && operatorVerified : toggled;
                return (
                  <div
                    key={ctrl.key}
                    title={`Insurer's why: ${ctrl.insurersWhy}`}
                    className={`rounded-md border px-3 py-2.5 ${
                      effectiveOn ? 'border-line' : 'border-warn-line bg-warn-bg'
                    }`}
                  >
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        data-testid={`tier2-${ctrl.key}`}
                        checked={toggled}
                        onChange={(e) => setTier2(agentId, key, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="text-sm font-semibold text-ink">{ctrl.label}</span>
                          <span
                            data-testid={`tier2-chip-${ctrl.key}`}
                            className={`ml-auto rounded-full border px-2 py-px text-2xs font-bold ${
                              effectiveOn
                                ? 'border-line bg-canvas text-faint'
                                : 'border-warn-line bg-panel text-warn'
                            }`}
                          >
                            {ctrl.surcharge} {effectiveOn ? 'if off' : 'applied'}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-2xs text-faint">
                          {tier2Desc(key, descInputs)}
                          {isKyb && operatorVerified && openVerified && (
                            <span className="num"> Verified {formatUtcStamp(openVerified.from)}.</span>
                          )}
                        </span>
                        {isKyb && !operatorVerified && (
                          <span
                            className="mt-1 block text-2xs font-semibold text-warn"
                            data-testid="kyb-mirror-note"
                          >
                            Company not verified: priced as skipped regardless of this
                            toggle. Complete verification in step 1 to apply it.
                          </span>
                        )}
                        {!effectiveOn && ctrl.chip && (
                          <span
                            className="mt-1 block text-xs font-semibold text-warn"
                            data-testid={`tier2-consequence-${ctrl.key}`}
                          >
                            {ctrl.chip}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-2xs text-faint">
              Hover any row to see the insurer's reasoning. Every surcharge is
              published in the Appendix 3 rate schedule. No hidden pricing.
            </p>
          </section>

          {/* Continue gate (REQ-7.5.1) */}
          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              data-testid="controls-continue"
              disabled={declined}
              onClick={() => navigate('/quote')}
              className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
            {declined && (
              <span className="text-xs font-semibold text-bad" data-testid="controls-continue-blocked">
                Re-enable the required control to restore your quote.
              </span>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Right rail — live quote (collapses to DECLINED, AC-2)          */}
        {/* ------------------------------------------------------------ */}
        <div className="self-start lg:sticky lg:top-6">
          <div className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">
            Your quote for {agent.name}
          </div>
          <QuoteSidebar result={pricing} capUsd={mandate.caps.perTx} />
          {pricing.kind === 'quoted' && (
            <div className="mt-3 rounded-card border border-line bg-panel p-4 text-xs shadow-card">
              <MathValue breakdown={premiumBreakdown(pricing, mandate.caps.perTx)}>
                <span className="font-bold text-ink" data-testid="controls-premium">
                  {formatUsd(pricing.premiumUsd)}/yr ≈{' '}
                  {formatN(usdToN(pricing.premiumUsd, usdPerN), { maxFractionDigits: 1 })}
                </span>
              </MathValue>
              {pricing.ceilingReached && (
                <p className="mt-1.5 text-2xs font-semibold text-bad" data-testid="ceiling-note">
                  Ceiling reached. The rate schedule labels this rung "tier-1
                  only: unassessed custom harness." The rate never exceeds 3.0%.
                </p>
              )}
              <p className="mt-1.5 text-2xs text-faint">
                Tier-1 gates never appear in this price. They are eligibility
                requirements, not priced options.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
