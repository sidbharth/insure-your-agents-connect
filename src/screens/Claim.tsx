/**
 * Screen 7.11 — File a claim (WP-5; plan §8, mockups postpurchase-claim-*).
 *
 * Empty state: process map + "ask your presenter to break something."
 * With injected incidents: open a claim per incident (populating the 12-item
 * evidence checklist from the §5d applicability matrix; near-miss claims get
 * the 7-day notify window), then the five-step flow:
 * Notify → Contain → Evidence → Clocks & decision → Outcome.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CLAIM_DEMO_COPY, CLAIM_EMPTY_STATE, CLAIM_HISTORY_COPY } from '../data/copy';
import {
  buildAdjudicationInput,
  openClaimForIncident,
  SCENARIOS,
} from '../data/incidents';
import { adjudicate } from '../lib/claims';
import { formatUsd } from '../lib/money';
import { useStore } from '../store';
import type { Claim as ClaimType, Incident } from '../store/types';
import ClocksAndDecision from './steps/ClocksAndDecision';
import Contain from './steps/Contain';
import Evidence from './steps/Evidence';
import Notify from './steps/Notify';
import Outcome from './steps/Outcome';
import { ClaimChrome, claimRef, fmtUtcDateLong, STEP_LABELS } from './steps/shared';

// ---------------------------------------------------------------------------
// Empty state / incident inbox
// ---------------------------------------------------------------------------

const PROCESS_MAP: { label: string; note: string }[] = [
  { label: 'Notify', note: 'within 48 hours of discovery' },
  { label: 'Contain', note: 'kill switch, freeze, rotation, imaging' },
  { label: 'Evidence', note: 'twelve item package' },
  { label: 'Clocks & decision', note: 'published deadlines' },
  { label: 'Outcome', note: 'payment or denial' },
];

function EmptyState() {
  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Claim">
      <h1 className="text-lg font-bold tracking-tight text-ink">File a claim</h1>
      <div className="mt-6 flex flex-col overflow-hidden rounded-card border border-line bg-panel shadow-card sm:flex-row">
        {PROCESS_MAP.map((step, i) => (
          <div
            key={step.label}
            className="flex flex-1 items-center gap-2.5 border-b border-line px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:py-4 sm:last:border-r-0"
          >
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-line text-2xs font-bold text-faint">
              {i + 1}
            </span>
            <div>
              <div className="text-xs font-semibold text-ink">{step.label}</div>
              <div className="text-2xs text-faint">{step.note}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted" data-testid="claim-empty-state">
        {CLAIM_EMPTY_STATE}
      </p>
      <div className="mt-4 flex justify-center">
        <Link
          to="/claim/demo"
          data-testid="start-claim-demo"
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {`${CLAIM_DEMO_COPY.entry} →`}
        </Link>
      </div>
    </div>
  );
}

function IncidentInbox({ incidents }: { incidents: Incident[] }) {
  const claims = useStore((s) => s.claims);
  const agents = useStore((s) => s.agents);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'incidents' | 'history'>('incidents');

  // Checklist population + near-miss window handling live in
  // openClaimForIncident, shared with the claim demo's detection screen.
  const open = (incident: Incident) => {
    navigate(`/claim/${openClaimForIncident(useStore.getState(), incident)}`);
  };

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold ${
      active ? 'bg-ink text-white' : 'text-muted'
    }`;

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Claim">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">File a claim</h1>
        </div>
        <Link
          to="/claim/demo"
          data-testid="start-claim-demo"
          className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink shadow-card"
        >
          {CLAIM_DEMO_COPY.entry}
        </Link>
      </div>
      <div
        className="mt-5 flex w-fit gap-1 rounded-lg border border-line bg-panel p-1"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'incidents'}
          data-testid="claims-tab-incidents"
          onClick={() => setTab('incidents')}
          className={tabClass(tab === 'incidents')}
        >
          {CLAIM_HISTORY_COPY.tabIncidents}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          data-testid="claims-tab-history"
          onClick={() => setTab('history')}
          className={tabClass(tab === 'history')}
        >
          {CLAIM_HISTORY_COPY.tabHistory}
        </button>
      </div>
      {tab === 'history' ? (
        <ClaimHistory />
      ) : (
        <div className="mt-3 flex flex-col gap-2.5" data-testid="incident-inbox">
          {incidents.map((incident) => {
            const agent = agents.find((a) => a.id === incident.agentId);
            const claim = claims.find((c) => c.incidentId === incident.id);
            const meta = SCENARIOS[incident.scenarioId];
            return (
              <div
                key={incident.id}
                className="flex items-center gap-4 rounded-card border border-line bg-panel px-4 py-3.5 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {meta.title} ({agent?.name ?? incident.agentId})
                  </div>
                  <div className="text-xs text-muted">
                    {incident.lossGrossUsd > 0
                      ? `Gross loss ${formatUsd(incident.lossGrossUsd)}`
                      : `Near-miss with ${formatUsd(incident.investigationCostUsd ?? 0)} in investigation costs`}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`open-claim-${incident.id}`}
                  onClick={() => open(incident)}
                  className={`flex-none rounded-lg px-3.5 py-2 text-sm font-semibold ${
                    claim !== undefined
                      ? 'border border-line text-ink'
                      : 'bg-accent text-ink'
                  }`}
                >
                  {claim !== undefined ? `Open claim ${claimRef(claim.id)}` : 'File a claim →'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab: every claim attempt with its live status
// ---------------------------------------------------------------------------

interface HistoryRow {
  claim: ClaimType;
  incident: Incident;
  agentName: string;
  status: { label: string; cls: string };
}

function ClaimHistory() {
  const claims = useStore((s) => s.claims);
  const incidents = useStore((s) => s.incidents);
  const agents = useStore((s) => s.agents);
  const mandates = useStore((s) => s.mandates);
  const enrollments = useStore((s) => s.enrollments);
  const operator = useStore((s) => s.operator);
  const priceFeed = useStore((s) => s.priceFeed);
  const navigate = useNavigate();

  const rows: HistoryRow[] = useMemo(() => {
    const list = claims.flatMap((claim) => {
      const incident = incidents.find((i) => i.id === claim.incidentId);
      if (incident === undefined) return [];
      const agentName =
        agents.find((a) => a.id === incident.agentId)?.name ?? incident.agentId;
      const anchors = claim.clockState.anchors;
      let status: HistoryRow['status'];
      if (anchors.paidAt !== undefined) {
        status = {
          label: CLAIM_HISTORY_COPY.statusPaid,
          cls: 'border-good-line bg-good-bg text-good',
        };
      } else if (anchors.determinedAt !== undefined) {
        // Unpaid determinations are always recomputed live (AC-13), the same
        // way the Outcome step renders them.
        const result = adjudicate(
          buildAdjudicationInput(
            { agents, mandates, enrollments, operator },
            incident,
            priceFeed.usdPerN,
          ),
        );
        status = result.eligibility.covered
          ? {
              label: CLAIM_HISTORY_COPY.statusApproved,
              cls: 'border-accent-line bg-accent-soft text-accent-ink',
            }
          : {
              label: CLAIM_HISTORY_COPY.statusDenied,
              cls: 'border-bad-line bg-bad-bg text-bad',
            };
      } else {
        status = {
          label: CLAIM_HISTORY_COPY.statusInProgress,
          cls: 'border-line bg-canvas text-muted',
        };
      }
      return [{ claim, incident, agentName, status }];
    });
    return list.reverse(); // newest first
  }, [claims, incidents, agents, mandates, enrollments, operator, priceFeed.usdPerN]);

  if (rows.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-muted" data-testid="claim-history-empty">
        {CLAIM_HISTORY_COPY.empty}
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5" data-testid="claim-history">
      {rows.map(({ claim, incident, agentName, status }) => (
        <button
          key={claim.id}
          type="button"
          data-testid={`history-row-${claim.id}`}
          onClick={() => navigate(`/claim/${claim.id}`)}
          className="flex w-full items-center gap-4 rounded-card border border-line bg-panel px-4 py-3.5 text-left shadow-card"
        >
          <span className="num flex-none font-mono text-xs font-bold text-accent-ink">
            {claimRef(claim.id)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              {SCENARIOS[incident.scenarioId].title} ({agentName})
            </div>
            <div className="text-xs text-muted">
              {CLAIM_HISTORY_COPY.opened(
                fmtUtcDateLong(claim.clockState.anchors.discoveredAt),
              )}
            </div>
          </div>
          <span
            data-testid={`history-status-${claim.id}`}
            className={`flex-none rounded border px-2 py-0.5 text-2xs font-semibold ${status.cls}`}
          >
            {status.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Five-step flow
// ---------------------------------------------------------------------------

function stepFromClaim(claim: ClaimType): number {
  const a = claim.clockState.anchors;
  if (a.determinedAt !== undefined) return 5;
  if (a.packageReceivedAt !== undefined) return 4;
  if (a.notifiedAt !== undefined) return 2;
  return 1;
}

function ClaimFlow({ claim, incident }: { claim: ClaimType; incident: Incident }) {
  const agents = useStore((s) => s.agents);
  const [step, setStep] = useState(() => stepFromClaim(claim));
  const agent = agents.find((a) => a.id === incident.agentId);
  const meta = SCENARIOS[incident.scenarioId];

  const crumb = `${agent?.name ?? incident.agentId}, ${meta.title.toLowerCase()}`;

  return (
    <ClaimChrome crumbRef={claimRef(claim.id)} crumb={crumb} subtitle="" step={step}>
      {step === 1 && (
        <Notify claim={claim} incident={incident} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <Contain
          claim={claim}
          incident={incident}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Evidence
          claim={claim}
          incident={incident}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <ClocksAndDecision
          claim={claim}
          incident={incident}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && (
        <Outcome claim={claim} incident={incident} onBack={() => setStep(4)} />
      )}
      <div className="sr-only">{STEP_LABELS[step - 1]}</div>
    </ClaimChrome>
  );
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

export default function Claim() {
  const { claimId } = useParams();
  const incidents = useStore((s) => s.incidents);
  const claims = useStore((s) => s.claims);

  const claim = useMemo(
    () => claims.find((c) => c.id === claimId),
    [claims, claimId],
  );
  const incident = useMemo(
    () => (claim === undefined ? undefined : incidents.find((i) => i.id === claim.incidentId)),
    [incidents, claim],
  );

  if (claim !== undefined && incident !== undefined) {
    return <ClaimFlow key={claim.id} claim={claim} incident={incident} />;
  }
  if (incidents.length === 0) return <EmptyState />;
  return <IncidentInbox incidents={incidents} />;
}
