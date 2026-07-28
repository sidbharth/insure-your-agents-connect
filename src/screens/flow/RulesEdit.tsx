/**
 * Spending rules (route /rules/:agentId) — the self-serve editor reached
 * from My cover.
 *
 * First principles: the rules ARE the cover boundary. The per payment limit
 * doubles as the agent's cover amount and is sized by its NEAR stack, so it
 * is read-only here. What an operator actually tunes day to day is
 * editable: daily and thirty day limits, the approved payee list (with the
 * 24 hour cooling rule), and the human approval threshold. None of these
 * change the price, so applying is immediate: a review of what changed, a
 * countersign ceremony, and the new version comes into force through the
 * store's real mandate machinery.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LatencyTheater } from '../../components/LatencyTheater';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { RULES_COPY } from '../../data/copy';
import { SEED_PRINCIPAL_NAME } from '../../data/seed';
import { demoNow } from '../../lib/demoClock';
import { shortHash } from '../../lib/hash';
import { formatN, formatUsd, usdToN } from '../../lib/money';
import { useStore } from '../../store';
import type { Mandate, WhitelistEntry } from '../../store/types';
import { newestMandate } from '../portfolio/helpers';

const HOUR_MS = 3_600_000;

/** "1.0" → "1.1" */
function bumpVersion(version: string): string {
  const [major, minor] = version.split('.');
  return `${major}.${Number(minor ?? '0') + 1}`;
}

export default function RulesEdit() {
  const { agentId } = useParams();
  const agents = useStore((s) => s.agents);
  const mandates = useStore((s) => s.mandates);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  useStore((s) => s.presenter.timeOffsetMs);
  const navigate = useNavigate();

  const agent = agents.find((a) => a.id === agentId);
  const mandate = agent !== undefined ? newestMandate(mandates[agent.id]) : undefined;

  const [dailyUsd, setDailyUsd] = useState<number | undefined>();
  const [monthlyUsd, setMonthlyUsd] = useState<number | undefined>();
  const [approvalUsd, setApprovalUsd] = useState<number | undefined>();
  const [payees, setPayees] = useState<WhitelistEntry[] | undefined>();
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const now = demoNow();

  // Draft values fall back to the mandate until the user touches them.
  const daily = dailyUsd ?? mandate?.caps.daily ?? 0;
  const monthly = monthlyUsd ?? mandate?.caps.rolling30d ?? 0;
  const approval = approvalUsd ?? mandate?.hitl.threshold ?? 0;
  const list = payees ?? mandate?.whitelist.entries ?? [];

  const changes = useMemo(() => {
    if (mandate === undefined) return [];
    const lines: string[] = [];
    if (daily !== mandate.caps.daily) {
      lines.push(`${RULES_COPY.daily} ${formatUsd(mandate.caps.daily)} → ${formatUsd(daily)}`);
    }
    if (monthly !== mandate.caps.rolling30d) {
      lines.push(
        `${RULES_COPY.monthly} ${formatUsd(mandate.caps.rolling30d)} → ${formatUsd(monthly)}`,
      );
    }
    if (approval !== mandate.hitl.threshold) {
      lines.push(
        `${RULES_COPY.approvalLabel} ${formatUsd(mandate.hitl.threshold)} → ${formatUsd(approval)}`,
      );
    }
    const before = new Set(mandate.whitelist.entries.map((p) => p.address));
    const after = new Set(list.map((p) => p.address));
    for (const p of list) {
      if (!before.has(p.address)) lines.push(RULES_COPY.addedPayee(p.name));
    }
    for (const p of mandate.whitelist.entries) {
      if (!after.has(p.address)) lines.push(RULES_COPY.removedPayee(p.name));
    }
    return lines;
  }, [mandate, daily, monthly, approval, list]);

  if (agent === undefined || mandate === undefined) {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-RulesEdit">
        <p className="text-sm text-body">{RULES_COPY.noChanges}</p>
      </div>
    );
  }

  const addPayee = () => {
    const name = newName.trim();
    const address = newAddress.trim();
    if (name.length === 0 || address.length === 0) return;
    setPayees([...list, { name, address, addedAt: now }]);
    setNewName('');
    setNewAddress('');
  };

  const removePayee = (address: string) => {
    setPayees(list.filter((p) => p.address !== address));
  };

  const apply = () => {
    const at = demoNow();
    const draft: Mandate = {
      ...mandate,
      version: bumpVersion(mandate.version),
      caps: { ...mandate.caps, daily, rolling30d: monthly },
      hitl: { ...mandate.hitl, threshold: approval },
      whitelist: { ...mandate.whitelist, entries: list },
      countersigned: { by: SEED_PRINCIPAL_NAME, at },
      inForceFrom: undefined,
      inForceTo: undefined,
    };
    const s = useStore.getState();
    s.setPendingEdit(agent.id, { draft, deltaUsd: 0, deltaN: 0 });
    s.commitMandateEdit(agent.id, at);
    navigate('/policies');
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-RulesEdit">
      <div className="mx-auto max-w-[680px]">
        <div className="num font-mono text-xs text-ink">{agent.name}</div>
        <h1 className="mt-1 text-lg font-bold tracking-tight text-ink">
          {RULES_COPY.title}
        </h1>
        <p className="mt-1 text-sm text-body">{RULES_COPY.sub(agent.name)}</p>

        <div className="mt-4 rounded-lg border border-accent-line bg-accent-soft px-4 py-3">
          <div className="text-2xs font-bold uppercase tracking-wider text-accent-ink">
            {RULES_COPY.coverLabel}
          </div>
          <div className="num mt-0.5 text-lg font-bold text-ink" data-testid="rules-cover">
            {formatN(usdToN(mandate.caps.perTx, usdPerN), { maxFractionDigits: 0 })}{' '}
            ({formatUsd(mandate.caps.perTx)})
          </div>
          <p className="mt-1 text-2xs text-body">{RULES_COPY.coverNote}</p>
        </div>

        <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">{RULES_COPY.limitsTitle}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink">
                {RULES_COPY.daily}
              </span>
              <input
                type="number"
                data-testid="rules-daily"
                value={daily}
                min={0}
                onChange={(e) => setDailyUsd(Number(e.target.value))}
                className="num mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
              />
            </label>
            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink">
                {RULES_COPY.monthly}
              </span>
              <input
                type="number"
                data-testid="rules-monthly"
                value={monthly}
                min={0}
                onChange={(e) => setMonthlyUsd(Number(e.target.value))}
                className="num mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
              />
            </label>
          </div>
          <p className="mt-2 text-2xs text-body">{RULES_COPY.limitsNote}</p>
        </div>

        <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">{RULES_COPY.payeesTitle}</h2>
          <p className="mt-1 text-2xs text-body">{RULES_COPY.payeesNote}</p>
          <ul className="mt-3 divide-y divide-line-soft" data-testid="rules-payees">
            {list.map((payee) => {
              const cooling = now - payee.addedAt < 24 * HOUR_MS;
              return (
                <li key={payee.address} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {payee.name}
                      {cooling && (
                        <span className="ml-2 inline-flex rounded border border-warn-line bg-warn-bg px-1.5 py-px text-2xs font-semibold text-warn">
                          {RULES_COPY.cooling}
                        </span>
                      )}
                    </span>
                    <span className="num block font-mono text-2xs text-body">
                      {shortHash(payee.address)}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid={`rules-remove-${payee.address.slice(0, 8)}`}
                    onClick={() => removePayee(payee.address)}
                    className="flex-none text-2xs font-semibold text-bad"
                  >
                    {RULES_COPY.remove}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
            <label className="min-w-0 flex-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink">
                {RULES_COPY.payeeName}
              </span>
              <input
                data-testid="rules-payee-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink">
                {RULES_COPY.payeeAddress}
              </span>
              <input
                data-testid="rules-payee-address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="num mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
              />
            </label>
            <button
              type="button"
              data-testid="rules-add-payee"
              onClick={addPayee}
              disabled={newName.trim().length === 0 || newAddress.trim().length === 0}
              className="flex-none rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink shadow-card disabled:opacity-40"
            >
              {RULES_COPY.addPayee}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">{RULES_COPY.approvalTitle}</h2>
          <label className="mt-3 block max-w-xs">
            <span className="text-2xs font-bold uppercase tracking-wider text-ink">
              {RULES_COPY.approvalLabel}
            </span>
            <input
              type="number"
              data-testid="rules-approval"
              value={approval}
              min={0}
              onChange={(e) => setApprovalUsd(Number(e.target.value))}
              className="num mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
            />
          </label>
          <p className="mt-2 text-2xs text-body">{RULES_COPY.approvalNote}</p>
        </div>

        {reviewing ? (
          <div className="mt-4 rounded-card border border-line bg-panel p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">{RULES_COPY.changesTitle}</h2>
              <SimulatedBadge />
            </div>
            {changes.length === 0 ? (
              <p className="mt-2 text-xs text-body">{RULES_COPY.noChanges}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5" data-testid="rules-changes">
                {changes.map((line) => (
                  <li key={line} className="num text-xs text-body">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {applying ? (
              <LatencyTheater
                className="mt-4"
                title={RULES_COPY.theaterTitle}
                steps={RULES_COPY.steps.map((label) => ({ label }))}
                totalMs={2200}
                onDone={apply}
              />
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  data-testid="rules-review-back"
                  onClick={() => setReviewing(false)}
                  className="text-sm font-semibold text-body"
                >
                  {RULES_COPY.back}
                </button>
                <button
                  type="button"
                  data-testid="rules-apply"
                  disabled={changes.length === 0}
                  onClick={() => setApplying(true)}
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  {RULES_COPY.apply}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              data-testid="rules-cancel"
              onClick={() => navigate('/policies')}
              className="text-sm font-semibold text-body"
            >
              {RULES_COPY.back}
            </button>
            <button
              type="button"
              data-testid="rules-review"
              onClick={() => setReviewing(true)}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
            >
              {RULES_COPY.review}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
