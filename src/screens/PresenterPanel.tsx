/**
 * Screen 7.12 — Presenter panel (WP-5; mockup postpurchase-presenter-panel.html,
 * REQ-7.12.1/7.12.2). Hidden stage-manager drawer: opened by the Shift+D ×3
 * chord (listener in WP-0's App.tsx) or ?presenter=1; never linked in-product.
 *
 * Six control groups, all real store actions — the panel is invisible except
 * through in-world consequences:
 *   Inject incident · Verification control · Price control · Time control ·
 *   Force states · Full reset (restores the exact seed incl. pinned:false).
 */
import { useState } from 'react';
import { SCENARIO_IDS, SCENARIOS } from '../data/incidents';
import { createSeedBook, HELIOS } from '../data/seed';
import { addBusinessDays, advance, DAY_MS } from '../lib/clocks';
import { demoNow } from '../lib/demoClock';
import { useStore } from '../store';
import type { ScenarioId } from '../store/types';

const SEED_HELIOS_EXTERNAL_USD =
  createSeedBook().components.find((c) => c.harness === HELIOS)?.externalCapsUsd ?? 0;
const FORCED_HELIOS_EXTERNAL_USD = 3_400_000; // pushes the share above 40%
const DROPPED_HELIOS_EXTERNAL_USD = 500_000; // drops the share below 40% (AC-6)

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#26282f] px-5 py-3.5">
      <div className="mb-2 text-[9.5px] uppercase tracking-[0.14em] text-[#7c818e]">
        {label}
      </div>
      {children}
    </div>
  );
}

interface SwitchRowProps {
  on: boolean;
  onToggle: () => void;
  testId?: string;
  children: React.ReactNode;
}

function SwitchRow({ on, onToggle, testId, children }: SwitchRowProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-on={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-xs text-[#d7dae1]"
    >
      <span>{children}</span>
      <span
        className={`relative h-3.5 w-[26px] flex-none rounded-full transition-colors ${
          on ? 'bg-[#f2d06b]' : 'bg-[#33363f]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all ${
            on ? 'left-[14px] bg-[#17181c]' : 'left-0.5 bg-[#8b909c]'
          }`}
        />
      </span>
    </button>
  );
}

export default function PresenterPanel() {
  const open = useStore((s) => s.presenter.panelOpen);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const injectIncident = useStore((s) => s.injectIncident);
  const advanceTime = useStore((s) => s.advanceTime);
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const operator = useStore((s) => s.operator);
  const priceFeed = useStore((s) => s.priceFeed);
  const book = useStore((s) => s.book);
  const claims = useStore((s) => s.claims);
  const verifyOperator = useStore((s) => s.verifyOperator);
  const revokeVerification = useStore((s) => s.revokeVerification);
  const pinPrice = useStore((s) => s.pinPrice);
  const unpinPrice = useStore((s) => s.unpinPrice);
  const tripGate = useStore((s) => s.tripGate);
  const cureGate = useStore((s) => s.cureGate);
  const suspendAgent = useStore((s) => s.suspendAgent);
  const unsuspendAgent = useStore((s) => s.unsuspendAgent);
  const markInstallmentOverdue = useStore((s) => s.markInstallmentOverdue);
  const payOverdueInstallments = useStore((s) => s.payOverdueInstallments);
  const setBookComponentCaps = useStore((s) => s.setBookComponentCaps);
  const setClockState = useStore((s) => s.setClockState);
  const reset = useStore((s) => s.reset);

  const [targetAgentId, setTargetAgentId] = useState('procurement-bot');
  const [lossOverride, setLossOverride] = useState('');

  if (!open) return null;

  const target = agents.find((a) => a.id === targetAgentId) ?? agents[0];

  const verified = operator.verificationHistory.some(
    (iv) => iv.verified && iv.to === undefined,
  );

  const loggingTripped = target !== undefined && !target.controls.tier1.actionLogging;
  const hashSuspended =
    target?.suspensionHistory.some(
      (iv) => iv.to === undefined && iv.reason.includes('hash'),
    ) ?? false;
  const premiumSuspended =
    target?.suspensionHistory.some(
      (iv) => iv.to === undefined && iv.reason.includes('premium'),
    ) ?? false;
  const heliosExternal =
    book.components.find((c) => c.harness === HELIOS)?.externalCapsUsd ??
    SEED_HELIOS_EXTERNAL_USD;
  const concentrationForced = heliosExternal >= FORCED_HELIOS_EXTERNAL_USD;
  const concentrationDropped = heliosExternal <= DROPPED_HELIOS_EXTERNAL_USD;
  const hasOverdue = enrollments.some(
    (e) =>
      e.agentId === targetAgentId &&
      e.paymentHistory.some(
        (i) => i.paidAt === undefined && i.dueAt < demoNow() - 15 * DAY_MS,
      ),
  );

  const inject = (scenarioId: ScenarioId) => {
    const parsed = Number(lossOverride);
    const lossUsd =
      lossOverride.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : undefined;
    injectIncident(scenarioId, targetAgentId, lossUsd);
  };

  /** Jump the demo clock by real business/calendar days. */
  const ff = (kind: '2bd' | '5bd' | '30d' | '10d' | '1y') => {
    const now = demoNow();
    const jump =
      kind === '2bd'
        ? addBusinessDays(now, 2) - now
        : kind === '5bd'
          ? addBusinessDays(now, 5) - now
          : kind === '30d'
            ? 30 * DAY_MS
            : kind === '10d'
              ? 10 * DAY_MS
              : 365 * DAY_MS;
    advanceTime(jump);
    // Fast-forward is real state: insurer anchors auto-fill as their windows
    // elapse on every open claim (§5c).
    const later = demoNow();
    for (const claim of useStore.getState().claims) {
      const next = advance(claim.clockState, later);
      if (next !== claim.clockState) setClockState(claim.id, next);
    }
  };

  /** Insurer misses a clock: "delay doesn't count against your time limits". */
  const missClock = () => {
    const latest = claims[claims.length - 1];
    if (latest === undefined) return;
    setClockState(latest.id, { ...latest.clockState, insurerMissed: true });
  };

  const toggleLoggingLapse = () => {
    if (target === undefined) return;
    if (loggingTripped) {
      // Cause-specific cure: reopen the gate (the underlying condition), then
      // close only this reason's suspension interval.
      cureGate(target.id, 'actionLogging');
      unsuspendAgent(target.id, undefined, 'tier-1 logging lapse');
    } else {
      tripGate(target.id, 'actionLogging');
      suspendAgent(target.id, 'tier-1 logging lapse');
    }
  };

  const toggleHashMismatch = () => {
    if (target === undefined) return;
    if (hashSuspended) unsuspendAgent(target.id, undefined, 'configuration hash mismatch');
    else suspendAgent(target.id, 'configuration hash mismatch');
  };

  const togglePremiumOverdue = () => {
    if (target === undefined) return;
    if (premiumSuspended) {
      // Settle the unpaid item (the underlying condition), then close only
      // this reason's suspension interval.
      payOverdueInstallments(target.id);
      unsuspendAgent(target.id, undefined, 'premium >15 days overdue');
    } else {
      markInstallmentOverdue(target.id);
      suspendAgent(target.id, 'premium >15 days overdue');
    }
  };

  /**
   * REQ-7.9.1: verification withdrawn is a suspension trigger. Revoking the
   * operator's verified status closes the verification interval AND opens a
   * per-agent suspension on every Active agent; restore verifies again and
   * closes only those 'verification withdrawn' intervals.
   */
  const revokeAndSuspend = () => {
    revokeVerification();
    for (const a of useStore.getState().agents) {
      if (a.status === 'Active') suspendAgent(a.id, 'verification withdrawn');
    }
  };
  const restoreAndUnsuspend = () => {
    verifyOperator();
    for (const a of useStore.getState().agents) {
      if (a.suspensionHistory.some((iv) => iv.to === undefined && iv.reason === 'verification withdrawn')) {
        unsuspendAgent(a.id, undefined, 'verification withdrawn');
      }
    }
  };

  const toggleConcentration = () => {
    setBookComponentCaps(
      HELIOS,
      concentrationForced ? SEED_HELIOS_EXTERNAL_USD : FORCED_HELIOS_EXTERNAL_USD,
    );
  };

  /** AC-6: drop the fictional book so the Helios share falls below 40% —
   *  frozen tags persist; only enrollments made after the drop lapse. */
  const toggleBookDrop = () => {
    setBookComponentCaps(
      HELIOS,
      concentrationDropped ? SEED_HELIOS_EXTERNAL_USD : DROPPED_HELIOS_EXTERNAL_USD,
    );
  };

  return (
    <aside
      data-testid="presenter-panel"
      role="dialog"
      aria-label="Presenter panel"
      className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-[#2c2e36] bg-[#17181c] font-mono text-[#c9cdd6] shadow-[-24px_0_64px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center gap-2.5 border-b border-[#2c2e36] px-5 py-4">
        <span className="h-2 w-2 flex-none rounded-full bg-[#f2d06b]" />
        <b className="text-sm tracking-[0.08em] text-[#f2d06b]">PRESENTER PANEL</b>
        <span className="ml-auto text-[10px] text-[#7c818e]">
          opened with{' '}
          <kbd className="rounded border border-[#3a3d47] bg-[#26282f] px-1.5 py-0.5 text-[10px]">
            ⇧D ×3
          </kbd>{' '}
          · never linked in-product
        </span>
        <button
          type="button"
          data-testid="presenter-close"
          onClick={() => setPanelOpen(false)}
          className="rounded border border-[#3a3d47] px-2 py-0.5 text-xs text-[#c9cdd6]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section label="Inject incident">
          <div className="mb-2.5 flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[10px] text-[#7c818e]">
              target agent
              <select
                data-testid="inject-target-agent"
                value={targetAgentId}
                onChange={(e) => setTargetAgentId(e.target.value)}
                className="rounded-md border border-[#33363f] bg-[#1f2127] px-2 py-1.5 text-xs text-[#d7dae1]"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-32 flex-col gap-1 text-[10px] text-[#7c818e]">
              loss $ (blank = default)
              <input
                data-testid="inject-loss-input"
                inputMode="numeric"
                value={lossOverride}
                onChange={(e) => setLossOverride(e.target.value)}
                placeholder="default"
                className="rounded-md border border-[#33363f] bg-[#1f2127] px-2 py-1.5 text-xs text-[#d7dae1] placeholder:text-[#565b66]"
              />
            </label>
          </div>
          {SCENARIO_IDS.map((id) => {
            const meta = SCENARIOS[id];
            return (
              <button
                key={id}
                type="button"
                data-testid={`inject-${id.toLowerCase()}`}
                onClick={() => inject(id)}
                className="mb-1.5 flex w-full items-center gap-2.5 rounded-md border border-[#33363f] bg-[#1f2127] px-3 py-2 text-left text-xs text-[#d7dae1] last:mb-0 hover:border-[#4a4e5a]"
              >
                <span className="w-10 flex-none font-bold text-[#f2d06b]">{id}</span>
                <span className="min-w-0 flex-1">
                  {meta.title}
                  <br />
                  <span className="text-[10.5px] text-[#8b909c]">{meta.presenterLine}</span>
                </span>
                <span className="flex-none rounded border border-[#3a3d47] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[#8b909c]">
                  INJECT
                </span>
              </button>
            );
          })}
          <div className="mt-2 text-[10px] text-[#6e7380]">
            each injection generates matching mock logs, chain data + attestation records
            so evidence auto-attach works
          </div>
        </Section>

        <Section label="Verification control">
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="verification-revoke"
              disabled={!verified}
              onClick={revokeAndSuspend}
              className="rounded-md border border-[#5a3a3a] bg-[#1f2127] px-3 py-1.5 text-xs font-semibold text-[#e2a9a0] disabled:opacity-40"
            >
              REVOKE verified status
            </button>
            <button
              type="button"
              data-testid="verification-restore"
              disabled={verified}
              onClick={restoreAndUnsuspend}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-3 py-1.5 text-xs font-semibold text-[#d7dae1] disabled:opacity-40"
            >
              RESTORE
            </button>
          </div>
          <div className="mt-2 text-[10px] text-[#6e7380]">
            revoke → inject → claim not payable (condition precedent) → restore → inject
            again → claim proceeds
          </div>
        </Section>

        <Section label="Price control">
          <SwitchRow
            on={priceFeed.pinned}
            onToggle={() => (priceFeed.pinned ? unpinPrice() : pinPrice())}
            testId="price-pin-toggle"
          >
            PIN N price at <b className="text-[#f2d06b]">$3.00</b>{' '}
            <span className="text-[10.5px] text-[#8b909c]">
              (Appendix-3 anchors reconcile exactly)
            </span>
          </SwitchRow>
          <div className="text-[10px] text-[#6e7380]">
            unpin to return to the live CoinGecko feed
          </div>
        </Section>

        <Section label="Time control">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="ff-2bd"
              onClick={() => ff('2bd')}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              ▶▶ +2 bd
            </button>
            <button
              type="button"
              data-testid="ff-5bd"
              onClick={() => ff('5bd')}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              ▶▶ +5 bd
            </button>
            <button
              type="button"
              data-testid="ff-30d"
              onClick={() => ff('30d')}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              ▶▶ +30 d
            </button>
            <button
              type="button"
              data-testid="ff-10d"
              onClick={() => ff('10d')}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              ▶▶ +10 d
            </button>
            <button
              type="button"
              data-testid="ff-1y"
              onClick={() => ff('1y')}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              AGE POLICY +1 yr
            </button>
            <button
              type="button"
              data-testid="miss-clock"
              onClick={missClock}
              className="rounded-md border border-[#33363f] bg-[#1f2127] px-2.5 py-1.5 text-xs text-[#d7dae1]"
            >
              MISS a clock · insurer delay
            </button>
          </div>
          <div className="mt-2 text-[10px] text-[#6e7380]">
            fast-forward is real state — claim clocks, pro-ration and renewals all read
            the same virtual clock
          </div>
        </Section>

        <Section label="Force states">
          <SwitchRow on={loggingTripped} onToggle={toggleLoggingLapse} testId="force-logging-lapse">
            Trip suspension · tier-1 logging lapse{' '}
            <span className="text-[10.5px] text-[#8b909c]">({target?.name})</span>
          </SwitchRow>
          <SwitchRow on={hashSuspended} onToggle={toggleHashMismatch} testId="force-hash-mismatch">
            Trip suspension · hash mismatch{' '}
            <span className="text-[10.5px] text-[#8b909c]">({target?.name})</span>
          </SwitchRow>
          <SwitchRow on={premiumSuspended} onToggle={togglePremiumOverdue} testId="force-premium-overdue">
            Trip suspension · premium &gt;15d overdue{' '}
            <span className="text-[10.5px] text-[#8b909c]">({target?.name})</span>
          </SwitchRow>
          <SwitchRow
            on={concentrationForced}
            onToggle={toggleConcentration}
            testId="force-concentration"
          >
            Book concentration <b className="text-[#f2d06b]">ABOVE 40%</b>{' '}
            <span className="text-[10.5px] text-[#8b909c]">({HELIOS})</span>
          </SwitchRow>
          <SwitchRow
            on={concentrationDropped}
            onToggle={toggleBookDrop}
            testId="drop-book"
          >
            Drop book <b className="text-[#f2d06b]">BELOW 40%</b>{' '}
            <span className="text-[10.5px] text-[#8b909c]">
              (frozen tags persist · later enrollments lapse)
            </span>
          </SwitchRow>
          <SwitchRow
            on={hasOverdue}
            onToggle={() => {
              if (!hasOverdue) markInstallmentOverdue(targetAgentId);
            }}
            testId="mark-installment-overdue"
          >
            Mark installment overdue{' '}
            <span className="text-[10.5px] text-[#8b909c]">({target?.name})</span>
          </SwitchRow>
        </Section>
      </div>

      <div className="flex items-center gap-2.5 border-t border-[#2c2e36] px-5 py-3.5">
        <button
          type="button"
          data-testid="presenter-reset"
          onClick={() => reset()}
          className="rounded-md border border-[#5a3a3a] bg-[#1f2127] px-3 py-1.5 text-xs font-bold text-[#e2a9a0]"
        >
          ⟲ FULL RESET — restore seed state
        </button>
        <span className="ml-auto text-[10px] text-[#6e7380]">incl. pin/unpin setting</span>
      </div>
    </aside>
  );
}
