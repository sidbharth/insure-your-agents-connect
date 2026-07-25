/**
 * Claim step 2 — Contain (screen 7.11, mockup postpurchase-claim-contain.html).
 * Four containment duties: kill switch (auto, timestamp from the action log),
 * whitelist freezes, credential rotations, and imaging before rebuild
 * (manual Confirm). Continue is disabled until all four are confirmed.
 */
import { useState } from 'react';
import type { Claim, Incident } from '../../store/types';
import { fmtUtcTimeSec } from './shared';

const MIN_MS = 60_000;

export interface ContainProps {
  claim: Claim;
  incident: Incident;
  onBack: () => void;
  onNext: () => void;
}

interface ContainItem {
  key: string;
  title: string;
  detail: string;
  /** Pre-confirmed with this timestamp; undefined = needs manual confirm. */
  at?: number;
  auto?: boolean;
}

export default function Contain({ claim, incident, onBack, onNext }: ContainProps) {
  // Imaging confirmation is step-local UI state (the frozen Claim shape has
  // no field for it); "already past this step" counts as confirmed so
  // revisiting the step keeps it.
  const alreadyPast = claim.clockState.anchors.packageReceivedAt !== undefined;
  const [imaged, setImaged] = useState(alreadyPast);

  const c = incident.containment;
  const items: ContainItem[] = [
    {
      key: 'kill-switch',
      title: 'Kill switch activated',
      detail: 'Halts the agent immediately. Timestamp read from your action log.',
      at: c.killSwitchAt,
      auto: true,
    },
    {
      key: 'whitelist',
      title: 'Affected whitelist entries frozen',
      detail: c.frozen.length > 0 ? c.frozen.join(', ') : 'No whitelist entries implicated',
      at: (c.killSwitchAt ?? incident.discoveredAt) + 4 * MIN_MS,
    },
    {
      key: 'credentials',
      title: 'Implicated credentials rotated',
      detail: c.rotated.length > 0 ? c.rotated.join(', ') : 'No credentials implicated',
      at: (c.killSwitchAt ?? incident.discoveredAt) + 22 * MIN_MS,
    },
    {
      key: 'imaging',
      title: 'Systems imaged before rebuild',
      detail: 'Preserve the machine state the adjuster will read',
      at: undefined,
    },
  ];

  const confirmedCount = items.filter((i) => i.at !== undefined).length + (imaged ? 1 : 0);
  const allConfirmed = confirmedCount === items.length;

  // Nothing on the frozen Claim shape stores imaging; the step gate itself is
  // the containment record (item 10 is already in the evidence package).
  const next = () => onNext();

  return (
    <div data-testid="claim-step-contain">
      <div className="rounded-card border border-line bg-panel p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-bold text-ink">Containment checklist</h2>
          <span
            data-testid="contain-count"
            className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${
              allConfirmed
                ? 'border-good-line bg-good-bg text-good'
                : 'border-warn-line bg-warn-bg text-warn'
            }`}
          >
            {confirmedCount} of {items.length} confirmed
          </span>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {items.map((item) => {
            const confirmed = item.at !== undefined || (item.key === 'imaging' && imaged);
            return (
              <li key={item.key} className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-2xs font-bold ${
                    confirmed ? 'bg-good-bg text-good' : 'border border-line text-faint'
                  }`}
                >
                  {confirmed ? '✓' : ''}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{item.title}</div>
                  <div className="text-xs text-muted">{item.detail}</div>
                </div>
                {item.at !== undefined ? (
                  <span className="num whitespace-nowrap font-mono text-xs text-muted">
                    {fmtUtcTimeSec(item.at)}
                    {item.auto ? ' (auto)' : ''}
                  </span>
                ) : imaged ? (
                  <span className="text-xs font-semibold text-good">confirmed</span>
                ) : (
                  <button
                    type="button"
                    data-testid="contain-confirm-imaging"
                    onClick={() => setImaged(true)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    Confirm
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
          >
            Back
          </button>
          <button
            type="button"
            data-testid="contain-continue"
            disabled={!allConfirmed}
            onClick={next}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to evidence →
          </button>
        </div>
      </div>
    </div>
  );
}
