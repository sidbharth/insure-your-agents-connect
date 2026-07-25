/**
 * Claims page history tab + denial-letter appeal flow:
 *  - the claims landing gains Incidents / History tabs; History lists every
 *    claim attempt with a live status (In progress / Approved / Denied /
 *    Paid) and opens the claim on click.
 *  - the denial letter is signed by the Claims Committee, no longer carries
 *    the "Why a denial gets a full letter" callout, and the right rail offers
 *    "Appeal claim" — a text form with a simulated attachment option.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { APPEAL_COPY, CLAIM_HISTORY_COPY } from '../../data/copy';
import { openClaimForIncident, resetIncidentCounter } from '../../data/incidents';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { setLatencyTestMode } from '../../lib/latency';
import { resetClaimCounter } from '../../store/claims';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import type { ScenarioId } from '../../store/types';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

/** Put cover in force for the sample agent (seed enrollments are empty). */
function enrollCover(agentId = 'procurement-bot'): void {
  const s = useStore.getState();
  s.saveMandate(agentId, testMandate());
  s.addEnrollment(testEnrollment({ agentId }));
}

/** Inject a scenario and open its claim with the checklist populated. */
function openClaimFor(scenarioId: ScenarioId): string {
  const s = useStore.getState();
  s.injectIncident(scenarioId, 'procurement-bot');
  const incident = useStore.getState().incidents.at(-1)!;
  return openClaimForIncident(useStore.getState(), incident);
}

/** Stamp a claim through to determination so the flow resumes at Outcome. */
function stampDetermined(claimId: string): void {
  const claim = useStore.getState().claims.find((c) => c.id === claimId)!;
  const now = demoNow();
  const evidence = claim.evidence.map((e) =>
    e.status === 'missing' ? { ...e, status: 'uploaded' as const } : e,
  );
  useStore.getState().updateClaim(claimId, { evidence });
  const anchors = {
    ...claim.clockState.anchors,
    notifiedAt: now,
    acknowledgedAt: now,
    packageReceivedAt: now,
    packageCompleteAt: now,
    determinedAt: now,
  };
  const next = { ...claim.clockState, anchors };
  useStore
    .getState()
    .setClockState(claimId, { ...next, phase: phaseFromAnchors(next) });
}

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  setLatencyTestMode(true);
  useStore.getState().reset();
  resetIncidentCounter();
  resetClaimCounter();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

describe('history tab', () => {
  it('shows the empty state when no claims exist yet', () => {
    enrollCover();
    useStore.getState().injectIncident('S-09', 'procurement-bot');
    renderAt('/claim');
    fireEvent.click(screen.getByTestId('claims-tab-history'));
    expect(screen.getByTestId('claim-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('incident-inbox')).not.toBeInTheDocument();
  });

  it('lists claims with live statuses and opens one on click', () => {
    enrollCover();
    const inProgress = openClaimFor('S-09');
    const denied = openClaimFor('S-24');
    stampDetermined(denied);
    const approved = openClaimFor('S-03');
    stampDetermined(approved);
    const paid = openClaimFor('S-18');
    const claim = useStore.getState().claims.find((c) => c.id === paid)!;
    stampDetermined(paid);
    useStore.getState().setClockState(paid, {
      ...claim.clockState,
      anchors: { ...claim.clockState.anchors, determinedAt: demoNow(), paidAt: demoNow() },
      phase: 'Paid',
    });

    renderAt('/claim');
    fireEvent.click(screen.getByTestId('claims-tab-history'));

    expect(screen.getByTestId(`history-status-${inProgress}`)).toHaveTextContent(
      CLAIM_HISTORY_COPY.statusInProgress,
    );
    expect(screen.getByTestId(`history-status-${denied}`)).toHaveTextContent(
      CLAIM_HISTORY_COPY.statusDenied,
    );
    expect(screen.getByTestId(`history-status-${approved}`)).toHaveTextContent(
      CLAIM_HISTORY_COPY.statusApproved,
    );
    expect(screen.getByTestId(`history-status-${paid}`)).toHaveTextContent(
      CLAIM_HISTORY_COPY.statusPaid,
    );

    fireEvent.click(screen.getByTestId(`history-row-${inProgress}`));
    expect(screen.getByTestId('claim-step-notify')).toBeInTheDocument();
  });
});

describe('denial letter and appeal', () => {
  function renderDeniedOutcome(): string {
    enrollCover();
    const claimId = openClaimFor('S-24');
    stampDetermined(claimId);
    renderAt(`/claim/${claimId}`);
    expect(screen.getByTestId('denial-letter')).toBeInTheDocument();
    return claimId;
  }

  it('signs off as the Claims Committee without the denial callout', () => {
    renderDeniedOutcome();
    expect(
      screen.getByText('Claims Committee, AgentConnect Insurance'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Why a denial gets a full letter')).not.toBeInTheDocument();
    expect(screen.getByText('Request fast-track review')).toBeInTheDocument();
  });

  it('condition-precedent denials keep only the verification action in the box', () => {
    enrollCover();
    useStore.getState().revokeVerification();
    const claimId = openClaimFor('S-24');
    stampDetermined(claimId);
    renderAt(`/claim/${claimId}`);
    const box = screen.getByTestId('condition-forward-action');
    expect(box).toHaveTextContent('Complete verification');
    expect(box).not.toHaveTextContent('forward-looking fix');
  });

  it('submits an appeal with grounds and a simulated attachment', () => {
    renderDeniedOutcome();
    fireEvent.click(screen.getByTestId('appeal-claim'));
    expect(screen.getByText(APPEAL_COPY.formTitle)).toBeInTheDocument();
    expect(screen.getByTestId('appeal-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('appeal-grounds'), {
      target: { value: 'The attested record was misread.' },
    });
    const file = new File(['x'], 'tracing-report.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('appeal-file-input'), {
      target: { files: [file] },
    });
    expect(screen.getByTestId('appeal-attachments')).toHaveTextContent(
      'tracing-report.pdf',
    );

    expect(screen.getByTestId('appeal-submit')).toBeEnabled();
    fireEvent.click(screen.getByTestId('appeal-submit'));
    expect(screen.getByTestId('appeal-submitted')).toHaveTextContent(
      APPEAL_COPY.submittedTitle,
    );
  });

  it('cancel returns to the appeal button without losing the letter', () => {
    renderDeniedOutcome();
    fireEvent.click(screen.getByTestId('appeal-claim'));
    fireEvent.click(screen.getByTestId('appeal-cancel'));
    expect(screen.getByTestId('appeal-claim')).toBeInTheDocument();
    expect(screen.getByTestId('denial-letter')).toBeInTheDocument();
  });
});
