/**
 * Claim step 3 — Evidence package (screen 7.11, mockup
 * postpurchase-claim-evidence.html). Renders the 12-item Appendix-2 checklist
 * from the incident's applicability matrix: auto items pre-stamped, one-click
 * simulated uploads via LatencyTheater, notApplicable rows greyed. The ring
 * counts APPLICABLE items only (AC-9); submitting sets packageReceivedAt and,
 * once the last applicable item is attached, packageCompleteAt — which is
 * what starts the 30-day determination clock (§5c).
 */
import { useState } from 'react';
import { LatencyTheater } from '../../components/LatencyTheater';
import {
  applicableItems,
  attachedItems,
  packageComplete,
} from '../../data/incidents';
import { phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { useStore } from '../../store';
import type { Claim, EvidenceItem, Incident } from '../../store/types';

export interface EvidenceProps {
  claim: Claim;
  incident: Incident;
  onBack: () => void;
  onNext: () => void;
}

function statusChip(item: EvidenceItem) {
  switch (item.status) {
    case 'auto':
      return (
        <span className="inline-flex whitespace-nowrap rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">
          {item.source ?? 'auto-attached from your records'}
        </span>
      );
    case 'uploaded':
      return (
        <span className="inline-flex whitespace-nowrap rounded-md border border-good-line bg-good-bg px-2 py-0.5 text-2xs font-semibold text-good">
          uploaded (simulated)
        </span>
      );
    default:
      return null;
  }
}

export default function Evidence({ claim, onBack, onNext }: EvidenceProps) {
  const setEvidenceStatus = useStore((s) => s.setEvidenceStatus);
  const setClockState = useStore((s) => s.setClockState);
  const [uploading, setUploading] = useState<number | undefined>();

  const evidence = claim.evidence;
  const applicable = applicableItems(evidence);
  const attached = attachedItems(evidence);
  const autoCount = evidence.filter((e) => e.status === 'auto').length;
  const complete = packageComplete(evidence);
  const submitted = claim.clockState.anchors.packageReceivedAt !== undefined;

  /** Stamp packageCompleteAt the moment the LAST applicable item attaches. */
  const stampCompletionIfDue = (justAttachedId: number) => {
    const after = evidence.map((e) =>
      e.id === justAttachedId ? { ...e, status: 'uploaded' as const } : e,
    );
    if (!packageComplete(after)) return;
    if (claim.clockState.anchors.packageCompleteAt !== undefined) return;
    if (!submitted) return; // completion is stamped at/after submission
    const anchors = { ...claim.clockState.anchors, packageCompleteAt: demoNow() };
    const next = { ...claim.clockState, anchors };
    setClockState(claim.id, { ...next, phase: phaseFromAnchors(next) });
  };

  const finishUpload = (itemId: number) => {
    setEvidenceStatus(claim.id, itemId, 'uploaded');
    stampCompletionIfDue(itemId);
    setUploading(undefined);
  };

  const submit = () => {
    if (!submitted) {
      const now = demoNow();
      const anchors = {
        ...claim.clockState.anchors,
        packageReceivedAt: now,
        ...(complete ? { packageCompleteAt: now } : {}),
      };
      const next = { ...claim.clockState, anchors };
      setClockState(claim.id, { ...next, phase: phaseFromAnchors(next) });
    }
    onNext();
  };

  const ringPct = applicable.length > 0 ? attached.length / applicable.length : 1;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]" data-testid="claim-step-evidence">
      <div className="rounded-card border border-line bg-panel p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-bold text-ink">Evidence package</h2>
          <span
            data-testid="evidence-auto-count"
            className="rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink"
          >
            {autoCount} items auto-attached
          </span>
        </div>

        <ul className="mt-4 divide-y divide-line" data-testid="evidence-list">
          {evidence.map((item) => {
            const na = item.status === 'notApplicable';
            const done = item.status === 'auto' || item.status === 'uploaded';
            return (
              <li
                key={item.id}
                data-testid={`evidence-item-${item.id}`}
                data-status={item.status}
                className={`flex items-center gap-3 py-2.5 ${na ? 'opacity-60' : ''}`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-2xs font-bold ${
                    done
                      ? 'bg-good-bg text-good'
                      : na
                        ? 'border border-dashed border-line text-faint'
                        : 'border border-line text-faint'
                  }`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className="num w-5 flex-none text-right font-mono text-xs text-faint">
                  {item.id}
                </span>
                <span
                  className={`min-w-0 flex-1 text-sm ${na ? 'text-faint' : 'text-ink'}`}
                >
                  {item.label}
                </span>
                {na ? (
                  <span className="whitespace-nowrap text-2xs italic text-faint">
                    {item.source ?? 'not applicable to this claim'}
                  </span>
                ) : item.status === 'missing' ? (
                  uploading === item.id ? (
                    <LatencyTheater
                      className="w-64 !p-2.5"
                      steps={[
                        { label: 'Preparing document…' },
                        { label: 'Uploading (simulated)…' },
                        { label: 'Stamping into the package…' },
                      ]}
                      totalMs={4800}
                      onDone={() => finishUpload(item.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`evidence-attach-${item.id}`}
                      onClick={() => setUploading(item.id)}
                      className="rounded-lg border border-line px-3 py-1 text-xs font-semibold text-ink"
                    >
                      Attach
                    </button>
                  )
                ) : (
                  statusChip(item)
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
            data-testid="evidence-submit"
            onClick={submit}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
          >
            {submitted ? 'Continue →' : 'Submit package →'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-line bg-panel p-4 text-center shadow-card">
          <div
            className="mx-auto flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#00EC97 ${ringPct * 360}deg, #ecefec 0deg)`,
            }}
          >
            <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-panel">
              <span className="num text-lg font-bold text-ink">
                {attached.length}
                <span className="text-sm font-semibold text-faint">/{applicable.length}</span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-faint">
                attached
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted" data-testid="evidence-ring-caption">
            <b className="text-ink">
              {attached.length} of {applicable.length} attached
            </b>
          </p>
        </div>
      </div>
    </div>
  );
}
