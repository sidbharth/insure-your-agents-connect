/**
 * Screen 7.4 — Set the mandate + Principal countersign (WP-2; mockups
 * wizard-mandate-*.html, postpurchase-dashboard-repricing-sheet.html).
 *
 * Wizard mode: four labeled pre-filled groups (action families / caps /
 * whitelist / human approval); the per-transaction cap is emphasized ("this
 * number sets your premium base") and live-linked to the QuoteSidebar
 * (REQ-7.4.2); the open-set toggle shows "+0.3% added to the
 * compromise-coverage rate" as a loading line; "Send to Principal for
 * countersignature" → latency theater → phone-mockup toast "Aria Chen
 * (Principal) reviewed and signed" (Simulated) → "Countersigned ✓ v1.0" +
 * timestamp. Continue is disabled until countersigned with the literal
 * reason "No countersignature, no cover (framework T3.2)" (REQ-7.4.1);
 * S-31 why-the-signature-matters note (REQ-7.4.3).
 *
 * Edit mode (WP-2 owned; WP-4 only navigates here): /mandate?edit=:agentId
 * loads that agent's live mandate as a pendingEdit draft; on save the
 * re-pricing sheet renders repriceDelta (§9a): annualized difference +
 * pro-rated due-now in $ and N, "takes effect only after payment — until
 * then the old mandate governs". "Pay difference" → executePayment('delta')
 * → commitMandateEdit closes the old version's inForceTo and applies the
 * new. The pending state is visibly labeled (AC-8).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { MathValue } from '../components/MathValue';
import { QuoteSidebar } from '../components/QuoteSidebar';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { isOperatorVerifiedNow } from '../components/UnverifiedBanner';
import {
  COUNTERSIGN_GATE_REASON,
  OPEN_SET_LOADING_NOTE,
  S31_NOTE,
} from '../data/copy';
import { SEED_PRINCIPAL_NAME } from '../data/seed';
import { demoNow } from '../lib/demoClock';
import { formatN, formatUsd, usdToN } from '../lib/money';
import { executePayment, PaymentAbortedError } from '../lib/payments';
import { DAY_MS } from '../lib/clocks';
import { priceAgent, repriceDelta } from '../lib/pricing';
import { useStore } from '../store';
import type { ActionFamilies, Mandate as MandateType } from '../store/types';
import { buildPricingInput, formatUtcStamp } from './wizard/format';
import { getWizardAgentId } from './wizard/wizardAgent';
import { WizardBack, WizardStepper } from './wizard/Stepper';

const ACTION_FAMILY_COPY: { key: keyof ActionFamilies; label: string; hint: string }[] = [
  { key: 'valueTransfers', label: 'Value transfers', hint: 'Send money to approved payees' },
  { key: 'tokenApprovals', label: 'Token approvals & delegations', hint: 'Grant other contracts spending rights' },
  { key: 'configChanges', label: 'Configuration changes', hint: 'Alter its own settings or tools' },
  { key: 'disputeFilings', label: 'Dispute / clawback filings', hint: 'Open recovery cases on its own' },
  { key: 'settlementProtocol', label: 'Settlement-protocol participation', hint: 'Join batch settlement rounds' },
  { key: 'credentialOps', label: 'Credential operations', hint: 'Rotate or issue keys' },
];

const COUNTERSIGN_STEPS = [
  { label: 'Mandate v1.0 sent to the Principal by secure link' },
  { label: `Opened by ${SEED_PRINCIPAL_NAME}` },
  { label: 'Awaiting review and signature…' },
];

const SELF_COUNTERSIGN_STEPS = [
  { label: 'Preparing mandate for signature' },
  { label: 'Recording authorized officer countersignature' },
  { label: 'Anchoring the signature to the enrollment record' },
];

function bumpVersion(v: string): string {
  const [major, minor = '0'] = v.split('.');
  return `${major}.${Number(minor) + 1}`;
}

function CapField({
  label,
  hint,
  value,
  onChange,
  emphasized = false,
  testId,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  emphasized?: boolean;
  testId?: string;
}) {
  return (
    <label
      className={`block rounded-md border p-3 text-xs font-semibold ${
        emphasized ? 'border-accent-line bg-accent-soft' : 'border-line bg-panel'
      }`}
    >
      <span className={emphasized ? 'text-accent-ink' : 'text-muted'}>{label}</span>
      {emphasized && (
        <span className="ml-1.5 whitespace-nowrap rounded bg-accent px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-ink">
          premium base
        </span>
      )}
      <span className="relative mt-1 block">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">$</span>
        <input
          type="number"
          data-testid={testId}
          className="num w-full rounded-md border border-line bg-panel py-1.5 pl-6 pr-2.5 text-sm font-normal text-ink"
          value={value}
          min={0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        />
      </span>
      <span className="mt-1 block text-2xs font-normal text-faint">{hint}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Wizard mode
// ---------------------------------------------------------------------------

function MandateWizard() {
  const navigate = useNavigate();
  const role = useStore((s) => s.role);
  const operatorName = useStore((s) => s.operator.name);
  const agentId = getWizardAgentId();
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const versions = useStore((s) => s.mandates[agentId]);
  const saveMandate = useStore((s) => s.saveMandate);
  const countersignMandate = useStore((s) => s.countersignMandate);
  const verificationHistory = useStore((s) => s.operator.verificationHistory);
  useStore((s) => s.presenter.timeOffsetMs);

  const mandate = versions?.[versions.length - 1];
  const [signing, setSigning] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  if (!agent || !mandate) {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Mandate">
        <WizardStepper current="mandate" className="mb-6" />
        <p className="text-sm text-muted">
          No agent connected yet. Start at{' '}
          <button type="button" className="text-accent-ink underline" onClick={() => navigate('/connect')}>
            Connect your agent
          </button>
          .
        </p>
      </div>
    );
  }

  const countersigned = mandate.countersigned !== undefined;
  const operatorVerified = isOperatorVerifiedNow(verificationHistory);
  const pricing = priceAgent(buildPricingInput(agent, mandate, operatorVerified));

  const patch = (fn: (m: MandateType) => MandateType) => saveMandate(agentId, fn(mandate));

  const selfSign = role === 'both';
  const startCountersign = () => setSigning(true);
  const finishCountersign = () => {
    if (selfSign) {
      countersignMandate(agentId, undefined, operatorName);
    } else {
      setToastVisible(true);
      countersignMandate(agentId);
    }
    setSigning(false);
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Mandate">
      <WizardStepper current="mandate" className="mb-3" />
      <WizardBack
        to="/connect"
        note="Changes on this page are saved automatically."
        className="mb-5"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-xl font-bold text-ink">
            Set the mandate{' '}
            <span className="font-normal text-muted">for {agent.name}</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            The mandate is the rulebook the Principal countersigns. The
            policy pays when the machinery enforcing it fails, so the mandate
            must be exact.
          </p>

          {/* Group 1 — What it may do */}
          <section className="mt-6 rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-soft text-2xs font-bold text-accent-ink">1</span>
              <h2 className="text-md font-semibold text-ink">Delegated actions</h2>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {ACTION_FAMILY_COPY.map((fam) => (
                <label key={fam.key} className="flex items-start gap-2 rounded-md border border-line px-3 py-2">
                  <input
                    type="checkbox"
                    data-testid={`family-${fam.key}`}
                    checked={mandate.actionFamilies[fam.key]}
                    onChange={(e) =>
                      patch((m) => ({
                        ...m,
                        actionFamilies: { ...m.actionFamilies, [fam.key]: e.target.checked },
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{fam.label}</span>
                    <span className="block text-2xs text-faint">{fam.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-2xs text-faint">
              Unchecked actions are not delegated. The agent cannot take that
              class of action.
            </p>
          </section>

          {/* Group 2 — How much */}
          <section className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-soft text-2xs font-bold text-accent-ink">2</span>
              <h2 className="text-md font-semibold text-ink">Limits</h2>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <CapField
                label="Per-transaction cap"
                hint="The maximum a single transaction may move. This is the base your rate applies to."
                value={mandate.caps.perTx}
                emphasized
                testId="cap-perTx"
                onChange={(v) => patch((m) => ({ ...m, caps: { ...m.caps, perTx: v } }))}
              />
              <CapField
                label="Daily velocity cap"
                hint="Total the agent may move in any 24 hours."
                value={mandate.caps.daily}
                testId="cap-daily"
                onChange={(v) => patch((m) => ({ ...m, caps: { ...m.caps, daily: v } }))}
              />
              <CapField
                label="Rolling 30-day cap"
                hint="Limits gradual outflows over any 30-day window."
                value={mandate.caps.rolling30d}
                testId="cap-rolling30d"
                onChange={(v) => patch((m) => ({ ...m, caps: { ...m.caps, rolling30d: v } }))}
              />
              <CapField
                label="Aggregate exposure cap"
                hint="Hard stop across the mandate's life."
                value={mandate.caps.aggregate}
                testId="cap-aggregate"
                onChange={(v) => patch((m) => ({ ...m, caps: { ...m.caps, aggregate: v } }))}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Permitted assets & chains</div>
                <div className="num mt-0.5 text-sm text-ink">
                  {mandate.assets.join(', ')} on {mandate.chains.join(', ')}
                </div>
                <div className="mt-0.5 text-2xs text-faint">Anything else is out of mandate.</div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Timelock threshold</div>
                <div className="num mt-0.5 text-sm text-ink">{formatUsd(mandate.timelock.threshold)}</div>
                <div className="mt-0.5 text-2xs text-faint">Transfers above this wait in the hold.</div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Timelock hold duration</div>
                <div className="num mt-0.5 text-sm text-ink">{mandate.timelock.holdHours} hours</div>
                <div className="mt-0.5 text-2xs text-faint">Time to catch a bad transfer.</div>
              </div>
            </div>
          </section>

          {/* Group 3 — Who it may pay */}
          <section className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-soft text-2xs font-bold text-accent-ink">3</span>
              <h2 className="text-md font-semibold text-ink">Payees</h2>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Whitelist mode</div>
                <select
                  data-testid="whitelist-mode"
                  className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-ink"
                  value={mandate.whitelist.mode}
                  onChange={(e) =>
                    patch((m) => ({
                      ...m,
                      whitelist: {
                        ...m.whitelist,
                        mode: e.target.value as MandateType['whitelist']['mode'],
                      },
                    }))
                  }
                >
                  <option value="address">By address</option>
                  <option value="verified-identity">Verified identity</option>
                  <option value="resolvable-name">Resolvable name</option>
                </select>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Who may edit the list</div>
                <div className="mt-1 text-sm text-ink">{mandate.whitelist.editors.join(', ')}</div>
                <div className="mt-0.5 text-2xs text-faint">
                  List edits are themselves a controlled action.
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-line px-3 py-2 text-xs">
              <div className="font-semibold text-muted">
                Approved payees ({mandate.whitelist.entries.length})
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="payee-list">
                {mandate.whitelist.entries.map((p) => (
                  <span
                    key={p.address}
                    title={p.address}
                    className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-2xs text-body"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 text-2xs text-faint">
                The agent can only pay entries on this list. New entries wait
                through a {mandate.whitelist.coolingHours}h cooling period
                before they can be paid.
              </div>
            </div>
            <label className="mt-3 flex items-start gap-2 rounded-md border border-line px-3 py-2">
              <input
                type="checkbox"
                data-testid="open-set-toggle"
                checked={mandate.whitelist.openSet}
                onChange={(e) =>
                  patch((m) => ({
                    ...m,
                    whitelist: { ...m.whitelist, openSet: e.target.checked },
                  }))
                }
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Open counterparty set</span>
                <span className="block text-2xs text-faint">Allow any merchant meeting criteria.</span>
                {mandate.whitelist.openSet && (
                  <span className="num mt-1 block text-xs font-semibold text-warn" data-testid="open-set-loading-note">
                    {OPEN_SET_LOADING_NOTE}
                  </span>
                )}
              </span>
            </label>
          </section>

          {/* Group 4 — When a human steps in */}
          <section className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-soft text-2xs font-bold text-accent-ink">4</span>
              <h2 className="text-md font-semibold text-ink">Human approval</h2>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Human approval above</div>
                <div className="num mt-0.5 text-sm text-ink" data-testid="hitl-threshold">
                  {formatUsd(mandate.hitl.threshold)}
                </div>
                <div className="mt-0.5 text-2xs text-faint">
                  A person must approve before the agent acts.
                </div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Named approvers</div>
                <div className="mt-0.5 text-sm text-ink">{mandate.hitl.approvers.join(', ')}</div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Approval channel</div>
                <div className="mt-0.5 text-sm text-ink">{mandate.hitl.channel}</div>
                <div className="mt-0.5 text-2xs text-faint">
                  The channel itself is part of the disclosed setup.
                </div>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <div className="font-semibold text-muted">Max session length</div>
                <div className="num mt-0.5 text-sm text-ink">{mandate.maxSessionHours} hours</div>
                <div className="mt-0.5 text-2xs text-faint">
                  After this, the Principal must re-authorize the delegation.
                </div>
              </div>
            </div>
          </section>

          {/* Countersignature */}
          <section className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
            <h2 className="text-md font-semibold text-ink">Principal countersignature</h2>
            <p className="mt-1.5 text-sm text-muted">
              {selfSign
                ? 'Your organization acts as both Operator and Principal. An authorized officer countersigns the mandate directly through the enrollment flow (Acceptance clause). Cover requires the countersignature.'
                : 'The Principal, whose funds this agent spends, must countersign the mandate. Cover requires the countersignature.'}
            </p>
            <p className="mt-2 text-xs text-muted" data-testid="s31-note">
              <b>Why the signature matters:</b> {S31_NOTE}
            </p>

            {!countersigned && !signing && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  data-testid="send-countersign"
                  onClick={startCountersign}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
                >
                  {selfSign
                    ? 'Countersign as Principal'
                    : 'Send to Principal for countersignature'}
                </button>
                <SimulatedBadge />
                <span className="ml-auto text-2xs text-faint">
                  Mandate v{mandate.version} draft, awaiting countersignature
                </span>
              </div>
            )}

            {signing && (
              <LatencyTheater
                className="mt-3"
                steps={selfSign ? SELF_COUNTERSIGN_STEPS : COUNTERSIGN_STEPS}
                onDone={finishCountersign}
              />
            )}

            {countersigned && mandate.countersigned && (
              <div
                data-testid="countersigned-card"
                className="mt-3 rounded-card border border-good-line bg-good-bg p-4"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-good">
                  Mandate v{mandate.version} countersigned ✓
                  <SimulatedBadge className="ml-auto" />
                </div>
                <p className="num mt-1 text-xs text-good" data-testid="countersigned-timestamp">
                  Signed by {mandate.countersigned.by} (Principal),{' '}
                  {formatUtcStamp(mandate.countersigned.at)}
                </p>
              </div>
            )}
          </section>

          {/* Continue gate (REQ-7.4.1) */}
          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              data-testid="mandate-continue"
              disabled={!countersigned}
              onClick={() => navigate('/controls')}
              className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
            {!countersigned && (
              <span className="text-xs text-muted" data-testid="continue-gate-reason">
                {COUNTERSIGN_GATE_REASON}
              </span>
            )}
          </div>
        </div>

        {/* live quote sidebar — cap edits move this immediately (REQ-7.4.2) */}
        <QuoteSidebar result={pricing} capUsd={mandate.caps.perTx} className="lg:sticky lg:top-6 self-start" />
      </div>

      {/* Phone-mockup toast: Aria Chen signs */}
      {toastVisible && (
        <div
          data-testid="countersign-toast"
          className="fixed bottom-6 right-6 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-ink p-4 text-white shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-sm font-bold">
              AC
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {SEED_PRINCIPAL_NAME} (Principal) reviewed and signed
              </div>
              <div className="mt-0.5 text-2xs text-[#a3adaa]">
                Mandate v{mandate.version} for {agent.name}
                {mandate.countersigned && <>, {formatUtcStamp(mandate.countersigned.at)}</>}
              </div>
              <SimulatedBadge className="mt-1.5 border-white/30 bg-transparent text-[#a3adaa]" />
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="ml-auto text-[#a3adaa]"
              onClick={() => setToastVisible(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit mode (/mandate?edit=:agentId) — AC-8
// ---------------------------------------------------------------------------

function MandateEdit({ agentId }: { agentId: string }) {
  const navigate = useNavigate();
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const versions = useStore((s) => s.mandates[agentId]);
  const enrollment = useStore((s) =>
    s.enrollments.find((e) => e.agentId === agentId && e.terminatedAt === undefined),
  );
  const pendingEdit = useStore((s) => s.pendingEdits[agentId]);
  const setPendingEdit = useStore((s) => s.setPendingEdit);
  const clearPendingEdit = useStore((s) => s.clearPendingEdit);
  const commitMandateEdit = useStore((s) => s.commitMandateEdit);
  const updateEnrollment = useStore((s) => s.updateEnrollment);
  const verificationHistory = useStore((s) => s.operator.verificationHistory);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const timeOffsetMs = useStore((s) => s.presenter.timeOffsetMs);

  const live = versions?.[versions.length - 1];
  const [draft, setDraft] = useState<MandateType | null>(() =>
    pendingEdit
      ? pendingEdit.draft
      : live
        ? { ...live, version: bumpVersion(live.version), countersigned: undefined, inForceFrom: undefined, inForceTo: undefined }
        : null,
  );
  const [sheetOpen, setSheetOpen] = useState(pendingEdit !== undefined);
  const [paying, setPaying] = useState(false);
  // The mandate version that was superseded — captured at pay time, because
  // after commitMandateEdit `live` re-derives to the just-applied draft.
  const [paid, setPaid] = useState<{ closedVersion: string } | null>(null);

  const operatorVerified = isOperatorVerifiedNow(verificationHistory);

  const delta = useMemo(() => {
    if (!agent || !live || !draft) return null;
    const now = demoNow();
    const renewalAt = enrollment?.renewalAt ?? now + 365 * DAY_MS;
    return repriceDelta(
      buildPricingInput(agent, live, operatorVerified),
      buildPricingInput(agent, draft, operatorVerified),
      now,
      renewalAt,
    );
    // timeOffsetMs: demoNow() reads the presenter clock — a fast-forward must
    // recompute the pro-rated delta, not display a stale one.
  }, [agent, live, draft, enrollment, operatorVerified, timeOffsetMs]);

  if (!agent || !live || !draft) {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Mandate">
        <p className="text-sm text-muted">Unknown agent. Nothing to edit.</p>
      </div>
    );
  }

  const oldAnnual = priceAgent(buildPricingInput(agent, live, operatorVerified));
  const newAnnual = priceAgent(buildPricingInput(agent, draft, operatorVerified));
  const oldPremium = oldAnnual.kind === 'quoted' ? oldAnnual.premiumUsd : 0;
  const newPremium = newAnnual.kind === 'quoted' ? newAnnual.premiumUsd : 0;
  const annualDiff = newPremium - oldPremium;

  // Editing the draft AFTER a save invalidates the saved pending edit — the
  // sheet closes and the stored edit clears, so the payment/commit path can
  // never charge for one mandate while a diverged draft goes in force.
  const patchDraft = (fn: (m: MandateType) => MandateType) => {
    if (sheetOpen || pendingEdit !== undefined) {
      clearPendingEdit(agentId);
      setSheetOpen(false);
    }
    setDraft((d) => (d ? fn(d) : d));
  };

  const saveAndReprice = () => {
    if (!delta) return;
    setPendingEdit(agentId, {
      draft,
      deltaUsd: delta.deltaUsd,
      deltaN: usdToN(delta.deltaUsd, usdPerN),
    });
    setSheetOpen(true);
  };

  const payDifference = async () => {
    // Payment, commit and re-price all consume the SAME immutable stored
    // pending edit — never the local draft, which could have diverged.
    const stored = useStore.getState().pendingEdits[agentId];
    if (!stored || !agent || !live) return;
    setPaying(true);
    const gen = useStore.getState().resetGeneration;
    try {
      // Recompute the pro-rated delta at PAY time from demoNow() — a
      // fast-forward between save and pay changes the remaining term.
      const now = demoNow();
      const payDelta = repriceDelta(
        buildPricingInput(agent, live, operatorVerified),
        buildPricingInput(agent, stored.draft, operatorVerified),
        now,
        enrollment?.renewalAt ?? now + 365 * DAY_MS,
      );
      // Refetch-first payment through the centralized helper (§7a), then the
      // separate store transition closes old inForceTo and applies the draft.
      const closedVersion = live.version;
      await executePayment(
        'delta',
        payDelta.deltaUsd,
        { agentIds: [agentId] },
        { stale: () => useStore.getState().resetGeneration !== gen },
      );
      commitMandateEdit(agentId);
      // Re-price the live enrollment so the dashboard row shows the new
      // premium/version — the frozen concentration loading is preserved.
      const hadConcentration =
        enrollment?.loadings.some((l) =>
          l.label.toLowerCase().includes('concentration'),
        ) ?? false;
      const repriced = priceAgent(
        buildPricingInput(agent, stored.draft, operatorVerified, {
          concentrationLoading: hadConcentration,
        }),
      );
      if (repriced.kind === 'quoted') {
        updateEnrollment(agentId, {
          mandateVersion: stored.draft.version,
          rateBreakdown: repriced.breakdown.filter((l) => l.group === 'ladder'),
          loadings: repriced.breakdown.filter((l) => l.group === 'loading'),
          premiumUsd: repriced.premiumUsd,
        });
      }
      setPaid({ closedVersion });
    } catch (err) {
      if (!(err instanceof PaymentAbortedError)) throw err;
    } finally {
      setPaying(false);
    }
  };

  const discard = () => {
    clearPendingEdit(agentId);
    setSheetOpen(false);
    navigate('/policies');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Mandate" data-mode="edit">
      <h1 className="text-xl font-bold text-ink">
        Edit mandate <span className="font-normal text-muted">for {agent.name}</span>
      </h1>

      {/* Pending state visibly labeled (AC-8) */}
      {pendingEdit && !paid && (
        <div
          data-testid="pending-edit-label"
          className="mt-3 flex items-center gap-2 rounded-card border border-warn-line bg-warn-bg px-4 py-2.5 text-sm text-warn"
        >
          <b>Pending mandate change: v{live.version} → v{draft.version}.</b>
          The old mandate (v{live.version}) governs your cover until the
          difference is paid.
        </div>
      )}

      {paid ? (
        <div className="mt-5 rounded-card border border-good-line bg-good-bg p-5" data-testid="edit-applied">
          <div className="text-sm font-bold text-good">
            Mandate v{draft.version} is now in force ✓
          </div>
          <p className="mt-1 text-xs text-good">
            The previous version (v{paid.closedVersion}) was closed at the
            moment of payment; new events are governed by v{draft.version}.
          </p>
          <button
            type="button"
            data-testid="edit-back-to-policies"
            onClick={() => navigate('/policies')}
            className="mt-3 rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-ink"
          >
            Back to My policies
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="text-2xs font-bold uppercase tracking-widest text-faint">
              Draft mandate v{draft.version}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <CapField
                label="Per-transaction cap"
                hint="The premium base. Changing it re-prices the policy."
                value={draft.caps.perTx}
                emphasized
                testId="edit-cap-perTx"
                onChange={(v) => patchDraft((m) => ({ ...m, caps: { ...m.caps, perTx: v } }))}
              />
              <CapField
                label="Daily velocity cap"
                hint="Total the agent may move in any 24 hours."
                value={draft.caps.daily}
                testId="edit-cap-daily"
                onChange={(v) => patchDraft((m) => ({ ...m, caps: { ...m.caps, daily: v } }))}
              />
            </div>
            <label className="mt-3 flex items-start gap-2 rounded-md border border-line px-3 py-2">
              <input
                type="checkbox"
                data-testid="edit-open-set"
                checked={draft.whitelist.openSet}
                onChange={(e) =>
                  patchDraft((m) => ({
                    ...m,
                    whitelist: { ...m.whitelist, openSet: e.target.checked },
                  }))
                }
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Open counterparty set</span>
                {draft.whitelist.openSet && (
                  <span className="num mt-0.5 block text-xs font-semibold text-warn">
                    {OPEN_SET_LOADING_NOTE}
                  </span>
                )}
              </span>
            </label>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                data-testid="save-reprice"
                onClick={saveAndReprice}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
              >
                Save & re-price
              </button>
              <button
                type="button"
                data-testid="edit-discard"
                onClick={discard}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
              >
                Discard change
              </button>
            </div>
          </div>

          {/* Re-pricing sheet (§9a, AC-8) */}
          {sheetOpen && delta && (
            <aside
              data-testid="repricing-sheet"
              className="rounded-card border border-line bg-panel p-5 shadow-card"
            >
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-ink">
                  Mandate change: updated pricing
                </div>
                <SimulatedBadge className="ml-auto" />
              </div>
              <div className="mt-1 text-2xs text-faint">
                {agent.name}, mandate v{live.version} → v{draft.version}
              </div>

              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Per-transaction cap</span>
                  <span className="num text-ink">
                    {formatUsd(live.caps.perTx)} → {formatUsd(draft.caps.perTx)}
                  </span>
                </div>
                {draft.whitelist.openSet !== live.whitelist.openSet && (
                  <div className="flex justify-between">
                    <span className="text-muted">Open counterparty set</span>
                    <span className="num text-ink">
                      {live.whitelist.openSet ? 'on' : 'off'} → {draft.whitelist.openSet ? 'on' : 'off'}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-line-soft pt-3">
                <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                  Annualized premium difference
                </div>
                <div className="num mt-1 text-md font-bold text-ink" data-testid="annual-delta">
                  {formatUsd(annualDiff, { signed: true })}/yr
                </div>
                <div className="mt-2 text-2xs font-bold uppercase tracking-widest text-faint">
                  Due now (pro-rated for the remaining term)
                </div>
                <MathValue breakdown={delta.breakdown} className="block">
                  <span className="text-md font-bold text-ink" data-testid="due-now-delta">
                    {formatUsd(delta.deltaUsd, { signed: true })}
                  </span>{' '}
                  <span className="text-sm text-muted">
                    ≈ {formatN(usdToN(delta.deltaUsd, usdPerN), { maxFractionDigits: 1 })} at
                    today's price
                  </span>
                </MathValue>
              </div>

              <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-2xs text-warn" data-testid="takes-effect-note">
                The change takes effect <b>only after payment</b>. Until then
                the current mandate (v{live.version}) governs cover.
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid="pay-difference"
                  disabled={paying}
                  onClick={() => void payDifference()}
                  className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489] disabled:opacity-50"
                >
                  {paying
                    ? 'Paying…'
                    : `Pay difference of ${formatN(usdToN(delta.deltaUsd, usdPerN), { maxFractionDigits: 1 })}`}
                </button>
                <button
                  type="button"
                  onClick={discard}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
                >
                  Discard
                </button>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

export default function Mandate() {
  const [params] = useSearchParams();
  const editAgentId = params.get('edit');
  if (editAgentId) return <MandateEdit key={editAgentId} agentId={editAgentId} />;
  return <MandateWizard />;
}
