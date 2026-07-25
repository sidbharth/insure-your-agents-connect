/**
 * Claim demo — self-serve entry into the claims flow (routes /claim/demo and
 * /claim/demo/:incidentId).
 *
 * Picker: choose one of the five scenarios; running one lands a full incident
 * on the fleet via landIncident (never arming presenter chrome). Detection:
 * staged playback of the monitoring record built from the incident's own
 * timestamps, ending in "File the claim", which opens the claim through the
 * same path as the incident inbox and hands over to the five-step flow.
 *
 * Demo copy lives in data/copy.ts (CLAIM_DEMO_*) and follows the strict
 * punctuation rule enforced by claim-demo.test.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { SimulatedBadge } from '../components/SimulatedBadge';
import {
  CLAIM_DEMO_COPY,
  CLAIM_DEMO_FEED_EVENT,
  CLAIM_DEMO_SCENARIOS,
  type ClaimDemoScenarioCopy,
} from '../data/copy';
import { landIncident, openClaimForIncident, SCENARIOS } from '../data/incidents';
import { demoNow } from '../lib/demoClock';
import { runLatencyTheater } from '../lib/latency';
import { formatUsd } from '../lib/money';
import { executePayment, PaymentAbortedError } from '../lib/payments';
import { useStore } from '../store';
import type { Incident, ScenarioId, Timestamp } from '../store/types';
import { enrollAgent, prepareImportedAgent } from './purchase/enroll';
import { claimRef, fmtUtcDateTime, fmtUtcTime } from './steps/shared';

/** Presenter panel default target — the seed fleet's flagship agent. */
const DEMO_AGENT_ID = 'procurement-bot';

const MIN_MS = 60_000;

const OUTCOME_CHIP_CLASSES: Record<ClaimDemoScenarioCopy['outcomeKind'], string> = {
  paid: 'border-good-line bg-good-bg text-good',
  nearMiss: 'border-warn-line bg-warn-bg text-warn-deep',
  denied: 'border-bad-line bg-bad-bg text-bad',
};

// ---------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------

/**
 * Activate simulated cover for the demo agent through the REAL purchase
 * machinery (mandate countersign + enrollment pricing + premium payment +
 * activation), so the conditions-precedent check passes honestly and the
 * scenario outcomes promised on the cards actually land.
 */
async function activateSampleCover(agentId: string): Promise<void> {
  const gen = useStore.getState().resetGeneration;
  prepareImportedAgent(agentId);
  const outcome = enrollAgent(agentId);
  if (!outcome.ok) return;

  const enrollment = useStore
    .getState()
    .enrollments.find((e) => e.agentId === agentId && e.terminatedAt === undefined);
  try {
    const receipt = await executePayment(
      'initial',
      enrollment?.premiumUsd ?? 0,
      { agentIds: [agentId] },
      { stale: () => useStore.getState().resetGeneration !== gen },
    );
    useStore.getState().activateEnrollments(receipt);
  } catch (err) {
    if (!(err instanceof PaymentAbortedError)) throw err;
  }
}

function Picker() {
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const navigate = useNavigate();
  const [activating, setActivating] = useState(false);
  const targetAgent = agents.find((a) => a.id === DEMO_AGENT_ID) ?? agents[0];

  // "In force now": an activated (paid), non-terminated enrollment covering
  // the demo clock's now. Un-paid quotes (effectiveAt 0) do not count.
  const coverInForce =
    targetAgent !== undefined &&
    enrollments.some(
      (e) =>
        e.agentId === targetAgent.id &&
        e.terminatedAt === undefined &&
        e.effectiveAt !== 0 &&
        e.effectiveAt <= demoNow(),
    );

  const run = (scenarioId: ScenarioId) => {
    if (targetAgent === undefined || !coverInForce) return;
    const incident = landIncident(useStore.getState(), scenarioId, targetAgent.id);
    if (incident !== undefined) navigate(`/claim/demo/${incident.id}`);
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-ClaimDemo">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {CLAIM_DEMO_COPY.title}
        </h1>
      </div>
      <div className="flex flex-col gap-2.5" data-testid="demo-scenario-list">
          {!coverInForce && targetAgent !== undefined && (
            activating ? (
              <LatencyTheater
                title={CLAIM_DEMO_COPY.activationTitle}
                steps={CLAIM_DEMO_COPY.activationSteps.map((label) => ({ label }))}
                totalMs={2200}
                onDone={() => {
                  void activateSampleCover(targetAgent.id).finally(() =>
                    setActivating(false),
                  );
                }}
              />
            ) : (
              <div
                data-testid="demo-cover-strip"
                className="flex flex-wrap items-center gap-3 rounded-card border border-warn-line bg-warn-bg px-4 py-3 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-warn-deep">
                    {CLAIM_DEMO_COPY.coverTitle} <SimulatedBadge />
                  </div>
                  <p className="mt-0.5 text-xs text-warn">
                    {CLAIM_DEMO_COPY.coverBody(targetAgent.name)}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="demo-activate-cover"
                  onClick={() => setActivating(true)}
                  className="flex-none rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
                >
                  {CLAIM_DEMO_COPY.activate}
                </button>
              </div>
            )
          )}
          {CLAIM_DEMO_SCENARIOS.map((s) => {
            const meta = SCENARIOS[s.scenarioId];
            const figure = meta.nearMiss
              ? CLAIM_DEMO_COPY.pickerNearMissFigure(
                  formatUsd(meta.investigationCostUsd ?? 0),
                )
              : CLAIM_DEMO_COPY.pickerLossFigure(formatUsd(meta.defaultLossUsd));
            return (
              <div
                key={s.scenarioId}
                data-testid={`demo-scenario-${s.scenarioId.toLowerCase()}`}
                className="rounded-card border border-line bg-panel px-4 py-3.5 shadow-card"
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{s.title}</span>
                      <span
                        className={`inline-flex rounded border px-1.5 py-px text-2xs font-semibold ${OUTCOME_CHIP_CLASSES[s.outcomeKind]}`}
                      >
                        {s.outcome}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{s.summary}</p>
                    <div className="num mt-1.5 text-2xs text-faint">{figure}</div>
                  </div>
                  <button
                    type="button"
                    data-testid={`run-demo-${s.scenarioId.toLowerCase()}`}
                    onClick={() => run(s.scenarioId)}
                    disabled={targetAgent === undefined || !coverInForce}
                    className="flex-none self-center rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                  >
                    {CLAIM_DEMO_COPY.run}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detection playback
// ---------------------------------------------------------------------------

interface FeedRow {
  at: Timestamp;
  text: string;
  tone: 'bad' | 'good' | 'neutral';
}

/**
 * Monitoring record rows, derived from the incident's own containment record
 * so the timestamps here agree with what the Contain step shows later
 * (freeze +4 min and rotation +22 min after the kill switch).
 */
function buildFeed(incident: Incident): FeedRow[] {
  const meta = SCENARIOS[incident.scenarioId];
  const rows: FeedRow[] = [
    {
      at: incident.eventAt,
      text: CLAIM_DEMO_FEED_EVENT[incident.scenarioId],
      tone: meta.nearMiss ? 'good' : 'bad',
    },
    { at: incident.discoveredAt, text: CLAIM_DEMO_COPY.alertLine, tone: 'neutral' },
  ];
  const killAt = incident.containment.killSwitchAt;
  if (killAt !== undefined) {
    rows.push({ at: killAt, text: CLAIM_DEMO_COPY.killLine, tone: 'good' });
  }
  const base = killAt ?? incident.discoveredAt;
  if (incident.containment.frozen.length > 0) {
    rows.push({ at: base + 4 * MIN_MS, text: CLAIM_DEMO_COPY.freezeLine, tone: 'good' });
  }
  if (incident.containment.rotated.length > 0) {
    rows.push({ at: base + 22 * MIN_MS, text: CLAIM_DEMO_COPY.rotateLine, tone: 'good' });
  }
  rows.push(
    meta.nearMiss
      ? {
          at: base + 30 * MIN_MS,
          text: CLAIM_DEMO_COPY.investigationLine(
            formatUsd(incident.investigationCostUsd ?? 0),
          ),
          tone: 'good',
        }
      : {
          at: base + 30 * MIN_MS,
          text: CLAIM_DEMO_COPY.lossLine(formatUsd(incident.lossGrossUsd)),
          tone: 'bad',
        },
  );
  rows.push({ at: base + 31 * MIN_MS, text: CLAIM_DEMO_COPY.recordLine, tone: 'neutral' });
  return rows;
}

const TONE_DOT: Record<FeedRow['tone'], string> = {
  bad: 'bg-bad',
  good: 'bg-good',
  neutral: 'bg-line',
};

function SummaryCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-0.5 text-xs font-semibold text-ink ${mono ? 'num font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function Detection({ incident }: { incident: Incident }) {
  const claims = useStore((s) => s.claims);
  const agents = useStore((s) => s.agents);
  const navigate = useNavigate();

  const agent = agents.find((a) => a.id === incident.agentId);
  const existing = claims.find((c) => c.incidentId === incident.id);
  const meta = SCENARIOS[incident.scenarioId];
  const demoCopy = CLAIM_DEMO_SCENARIOS.find((s) => s.scenarioId === incident.scenarioId);
  const feed = useMemo(() => buildFeed(incident), [incident]);

  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRevealed(0);
    setDone(false);
    void runLatencyTheater(
      feed.map((row) => ({ label: row.text })),
      (p) => {
        if (!cancelled) setRevealed(Math.max(p.stepIndex + 1, p.completed));
      },
      4200,
    ).then(() => {
      if (!cancelled) setDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [feed]);

  const fileClaim = () => {
    navigate(`/claim/${openClaimForIncident(useStore.getState(), incident)}`);
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-ClaimDemo">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">
            {CLAIM_DEMO_COPY.detectionTitle}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {demoCopy?.title ?? meta.title} ({agent?.name ?? incident.agentId})
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-[#f6f8f7] px-2 py-0.5 text-2xs font-semibold text-faint">
          Incident record <SimulatedBadge />
        </span>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-card border border-line bg-panel shadow-card">
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
            <h2 className="text-md font-semibold text-ink">{CLAIM_DEMO_COPY.feedTitle}</h2>
            <SimulatedBadge />
          </div>
          <div className="flex flex-col px-5 py-1.5" data-testid="demo-feed">
            {feed.slice(0, revealed).map((row, i) => (
              <div
                key={row.text}
                data-testid={`demo-feed-row-${i}`}
                className="flex items-baseline gap-3 border-b border-line-soft py-2.5 last:border-b-0"
              >
                <span className="num flex-none font-mono text-2xs text-faint">
                  {fmtUtcTime(row.at)}
                </span>
                <span
                  className={`h-1.5 w-1.5 flex-none self-center rounded-full ${TONE_DOT[row.tone]}`}
                />
                <span className="text-xs text-body">{row.text}</span>
              </div>
            ))}
            {!done && <div className="py-2.5 text-2xs text-faint">…</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <Link
              to="/claim/demo"
              data-testid="demo-choose-another"
              className="text-sm font-semibold text-muted"
            >
              {CLAIM_DEMO_COPY.chooseAnother}
            </Link>
            <button
              type="button"
              data-testid="demo-file-claim"
              disabled={!done}
              onClick={fileClaim}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {existing !== undefined
                ? `Open claim ${claimRef(existing.id)}`
                : CLAIM_DEMO_COPY.fileClaim}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          <div
            className="rounded-card border border-line bg-panel p-4 shadow-card"
            data-testid="demo-summary"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <SummaryCell
                label={CLAIM_DEMO_COPY.summaryLabels.agent}
                value={agent?.name ?? incident.agentId}
              />
              <SummaryCell
                label={CLAIM_DEMO_COPY.summaryLabels.eventTime}
                value={fmtUtcDateTime(incident.eventAt)}
                mono
              />
              {meta.nearMiss ? (
                <SummaryCell
                  label={CLAIM_DEMO_COPY.summaryLabels.investigation}
                  value={formatUsd(incident.investigationCostUsd ?? 0)}
                  mono
                />
              ) : (
                <SummaryCell
                  label={CLAIM_DEMO_COPY.summaryLabels.grossLoss}
                  value={formatUsd(incident.lossGrossUsd)}
                  mono
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

export default function ClaimDemo() {
  const { incidentId } = useParams();
  const incidents = useStore((s) => s.incidents);
  const incident =
    incidentId === undefined
      ? undefined
      : incidents.find((i) => i.id === incidentId);

  // A stale or unknown incident id (e.g. after a session reset) falls back to
  // the picker rather than erroring.
  if (incident !== undefined) return <Detection key={incident.id} incident={incident} />;
  return <Picker />;
}
