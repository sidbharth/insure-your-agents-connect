/**
 * Claim step 4 — Conditions, clocks, decision (screen 7.11, mockup
 * postpurchase-claim-clocks.html). `adjudicate` runs conditions precedent
 * FIRST, from interval histories at event time (§5a/5b): a failure renders
 * the red banner and routes straight to the condition-precedent denial
 * (AC-13). A pass renders the five-node published-clock timeline from the
 * §5c state machine; the presenter fast-forward advances REAL state — the
 * demo clock moves and insurer anchors auto-fill at their due instants.
 */
import { useMemo } from 'react';
import { INSURER_DELAY_NOTE } from '../../data/copy';
import { buildAdjudicationInput } from '../../data/incidents';
import { adjudicate } from '../../lib/claims';
import { advance, deadlines } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { useStore } from '../../store';
import type { AdjudicationResult, Claim, Incident, Timestamp } from '../../store/types';
import { claimRef, fmtUtcDayTime, fmtUtcTime } from './shared';

const MIN_MS = 60_000;

export interface ClocksProps {
  claim: Claim;
  incident: Incident;
  onBack: () => void;
  onNext: () => void;
}

interface TimelineNode {
  label: string;
  sub: string;
  at?: Timestamp;
}

export default function ClocksAndDecision({ claim, incident, onBack, onNext }: ClocksProps) {
  const agents = useStore((s) => s.agents);
  const mandates = useStore((s) => s.mandates);
  const enrollments = useStore((s) => s.enrollments);
  const operator = useStore((s) => s.operator);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const setClockState = useStore((s) => s.setClockState);
  const setAdjudication = useStore((s) => s.setAdjudication);
  const advanceTime = useStore((s) => s.advanceTime);

  // Always RECOMPUTED from interval histories at event time — never a
  // snapshot (REQ-7.11.3, AC-13).
  const result: AdjudicationResult = useMemo(
    () =>
      adjudicate(
        buildAdjudicationInput({ agents, mandates, enrollments, operator }, incident, usdPerN),
      ),
    [agents, mandates, enrollments, operator, incident, usdPerN],
  );

  const conditionsPass = result.conditionsPrecedent.pass;
  const anchors = claim.clockState.anchors;
  const rows = deadlines(claim.clockState);
  const determined = anchors.determinedAt !== undefined;

  const mandateVersion =
    (mandates[incident.agentId] ?? [])[0]?.version ?? '1.0';

  /** Presenter fast-forward: jump the demo clock to the next due instant. */
  const fastForward = () => {
    const nextDue = rows
      .filter((r) => r.status === 'pending' && r.dueAt !== undefined)
      .map((r) => r.dueAt as number)
      .sort((a, b) => a - b)[0];
    if (nextDue === undefined) return;
    const jump = nextDue - demoNow() + MIN_MS;
    if (jump > 0) advanceTime(jump);
    const next = advance(claim.clockState, demoNow());
    setClockState(claim.id, next);
  };

  /** Denial route (conditions failed): the denial IS the determination. */
  const continueToDenial = () => {
    setAdjudication(claim.id, result);
    if (!determined) {
      const next = advance(
        { ...claim.clockState, anchors: { ...anchors, determinedAt: demoNow() } },
        demoNow(),
      );
      setClockState(claim.id, next);
    }
    onNext();
  };

  const continueToOutcome = () => {
    setAdjudication(claim.id, result);
    onNext();
  };

  const nodes: TimelineNode[] = [
    { label: 'Notified', sub: 'within 48h of discovery', at: anchors.notifiedAt },
    { label: 'Acknowledged', sub: 'insurer, 2 business days', at: anchors.acknowledgedAt },
    {
      label: 'Package check',
      sub: 'incomplete? told within 5 business days',
      at: anchors.packageCompleteAt ?? anchors.incompleteNoticeAt,
    },
    {
      label: 'Determination',
      sub: 'within 30 days of a complete package',
      at: anchors.determinedAt,
    },
    { label: 'Payment', sub: 'within 10 days after', at: anchors.paidAt },
  ];
  const currentIdx = nodes.findIndex((n) => n.at === undefined);

  return (
    <div className="flex flex-col gap-4" data-testid="claim-step-clocks">
      {conditionsPass ? (
        <div
          data-testid="conditions-banner"
          className="flex items-center gap-3 rounded-card border border-good-line bg-good-bg px-4 py-3 text-sm"
        >
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-good text-2xs font-bold text-white">
            ✓
          </span>
          <span className="text-good">
            <b>Conditions precedent passed as of event time ({fmtUtcTime(incident.eventAt)}):</b>{' '}
            tier-1 gates operative, mandate v{mandateVersion} in force, premium
            current, and KYB verification current
          </span>
        </div>
      ) : (
        <div
          data-testid="conditions-banner"
          className="flex items-center gap-3 rounded-card border border-bad-line bg-bad-bg px-4 py-3 text-sm"
        >
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-bad text-2xs font-bold text-white">
            ✕
          </span>
          <span className="text-bad">
            <b>Conditions precedent failed as of event time ({fmtUtcTime(incident.eventAt)}):</b>{' '}
            {result.conditionsPrecedent.failedCondition}. No claim is payable for this event.
          </span>
        </div>
      )}

      <div>
        <div className="rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-md font-bold text-ink">
              Status timeline for claim {claimRef(claim.id)}
            </h2>
            <div className="flex items-center gap-2">
              {conditionsPass &&
                claim.clockState.phase === 'PackageComplete' &&
                !determined && (
                  <span
                    data-testid="interim-payment-chip"
                    className="rounded-md border border-[#b2f0d6] bg-[#e4fbf1] px-2 py-0.5 text-2xs font-semibold text-[#0b7a52]"
                  >
                    Interim payment available: up to 50%, repayable if the
                    claim ultimately fails
                  </span>
                )}
              {conditionsPass && (
                <button
                  type="button"
                  data-testid="fast-forward"
                  onClick={fastForward}
                  className="whitespace-nowrap rounded-lg border border-line bg-[#fafbfa] px-3 py-1.5 font-mono text-xs font-semibold text-ink"
                >
                  ▶▶ Fast-forward <span className="text-faint">to next deadline</span>
                </button>
              )}
            </div>
          </div>

          {conditionsPass ? (
            <>
              <div className="mt-6 flex items-start overflow-x-auto">
                {nodes.map((node, i) => {
                  const met = node.at !== undefined;
                  const current = i === currentIdx;
                  return (
                    <div key={node.label} className="flex flex-1 flex-col items-center text-center">
                      <div className="flex w-full items-center">
                        <div
                          className={`h-px flex-1 ${i === 0 ? 'invisible' : ''} ${met || current ? 'bg-good-line' : 'bg-line'}`}
                        />
                        <span
                          data-testid={`clock-node-${i}`}
                          data-met={met}
                          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 text-xs font-bold ${
                            met
                              ? 'border-good bg-good-bg text-good'
                              : current
                                ? 'border-accent bg-panel text-accent-ink ring-2 ring-accent-line'
                                : 'border-line bg-panel text-faint'
                          }`}
                        >
                          {met ? '✓' : ''}
                        </span>
                        <div
                          className={`h-px flex-1 ${i === nodes.length - 1 ? 'invisible' : ''} ${
                            met ? 'bg-good-line' : 'bg-line'
                          }`}
                        />
                      </div>
                      <div
                        className={`mt-2 text-xs font-semibold ${met || current ? 'text-ink' : 'text-faint'}`}
                      >
                        {node.label}
                      </div>
                      <div className="mt-0.5 px-1 text-2xs text-faint">{node.sub}</div>
                      {node.at !== undefined && (
                        <div className="num mt-0.5 font-mono text-2xs text-muted">
                          {fmtUtcDayTime(node.at)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center justify-end border-t border-line pt-3 text-xs text-muted">
                <span
                  data-testid="insurer-delay-note"
                  className={
                    claim.clockState.insurerMissed
                      ? 'rounded-md border border-warn-line bg-warn-bg px-2 py-0.5 font-semibold text-warn'
                      : ''
                  }
                >
                  {INSURER_DELAY_NOTE}
                </span>
              </div>
            </>
          ) : null}

          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
            >
              Back
            </button>
            {conditionsPass ? (
              <button
                type="button"
                data-testid="clocks-continue"
                disabled={!determined}
                onClick={continueToOutcome}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {determined ? 'View outcome →' : 'Awaiting determination…'}
              </button>
            ) : (
              <button
                type="button"
                data-testid="clocks-continue"
                onClick={continueToDenial}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
              >
                Continue to determination →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
