/**
 * Claim demo component tests — screens /claim/demo and /claim/demo/:incidentId:
 *  - "Start claim demo" entry points on the claims page (empty state + inbox).
 *  - Cover gate: with no active cover for the sample agent the picker shows
 *    the activation strip and the run buttons stay disabled; one click runs
 *    the real purchase machinery (enroll + premium + activation).
 *  - Picker lists the five scenarios; running one lands an incident WITHOUT
 *    arming the presenter's dashboard affordance (no presenter chrome leaks).
 *  - Detection playback reveals the monitoring record, then files the claim
 *    through the same checklist seeding as the incident inbox, near-miss
 *    window and feed/credit extras included.
 *  - Demo copy obeys the punctuation rule: no colons, semicolons, or dashes
 *    of any kind in user-facing demo strings.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import {
  APPEAL_COPY,
  CLAIM_DEMO_COPY,
  CLAIM_DEMO_FEED_EVENT,
  CLAIM_DEMO_SCENARIOS,
  CLAIM_HISTORY_COPY,
} from '../../data/copy';
import {
  landIncident,
  openClaimForIncident,
  resetIncidentCounter,
  SCENARIO_IDS,
} from '../../data/incidents';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { setLatencyTestMode } from '../../lib/latency';
import { resetClaimCounter } from '../../store/claims';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';

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

describe('claims page entry points', () => {
  it('empty state offers "Start claim demo" and it navigates to the picker', () => {
    renderAt('/claim');
    expect(screen.getByTestId('claim-empty-state')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('start-claim-demo'));
    expect(screen.getByTestId('screen-ClaimDemo')).toBeInTheDocument();
    expect(screen.getByTestId('demo-scenario-list')).toBeInTheDocument();
  });

  it('incident inbox keeps the entry point once incidents exist', () => {
    landIncident(useStore.getState(), 'S-09', 'procurement-bot');
    renderAt('/claim');
    expect(screen.getByTestId('incident-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('start-claim-demo')).toBeInTheDocument();
  });
});

describe('picker', () => {
  it('lists all five scenarios with run buttons', () => {
    enrollCover();
    renderAt('/claim/demo');
    for (const id of SCENARIO_IDS) {
      expect(screen.getByTestId(`demo-scenario-${id.toLowerCase()}`)).toBeInTheDocument();
      expect(screen.getByTestId(`run-demo-${id.toLowerCase()}`)).toBeInTheDocument();
    }
    // Cover is in force, so no activation strip and runs are unlocked.
    expect(screen.queryByTestId('demo-cover-strip')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-demo-s-03')).toBeEnabled();
  });

  it('without cover the runs stay locked until one-click activation', async () => {
    renderAt('/claim/demo');
    expect(screen.getByTestId('demo-cover-strip')).toBeInTheDocument();
    expect(screen.getByTestId('run-demo-s-03')).toBeDisabled();

    fireEvent.click(screen.getByTestId('demo-activate-cover'));
    await waitFor(() =>
      expect(screen.queryByTestId('demo-cover-strip')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByTestId('run-demo-s-03')).toBeEnabled());

    // Activation used the real machinery: paid enrollment + Active agent.
    const state = useStore.getState();
    const enrollment = state.enrollments.find((e) => e.agentId === 'procurement-bot');
    expect(enrollment).toBeDefined();
    expect(enrollment!.effectiveAt).toBeGreaterThan(0);
    expect(enrollment!.paymentHistory.length).toBeGreaterThan(0);
    expect(state.agents.find((a) => a.id === 'procurement-bot')?.status).toBe('Active');
  });

  it('running a scenario lands an incident without arming the presenter', () => {
    enrollCover();
    renderAt('/claim/demo');
    fireEvent.click(screen.getByTestId('run-demo-s-03'));

    const state = useStore.getState();
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0].scenarioId).toBe('S-03');
    expect(state.incidents[0].agentId).toBe('procurement-bot');
    // The demo must never leak presenter chrome onto the dashboard.
    expect(state.presenter.armed).toBe(false);
    expect(screen.getByTestId('demo-feed')).toBeInTheDocument();
  });

  it('the presenter path still arms the dashboard affordance', () => {
    useStore.getState().injectIncident('S-03', 'procurement-bot');
    expect(useStore.getState().presenter.armed).toBe(true);
  });

  it('an unknown incident id falls back to the picker', () => {
    renderAt('/claim/demo/inc-s-03-99');
    expect(screen.getByTestId('demo-scenario-list')).toBeInTheDocument();
  });
});

describe('detection playback and filing', () => {
  it('reveals the full monitoring record and files the claim into step 1', async () => {
    enrollCover();
    renderAt('/claim/demo');
    fireEvent.click(screen.getByTestId('run-demo-s-03'));

    // Latency test mode: playback resolves immediately; the CTA unlocks.
    await waitFor(() => expect(screen.getByTestId('demo-file-claim')).toBeEnabled());
    // S-03 feed: event, alert, kill switch, freeze, rotation, loss, record.
    expect(screen.getByTestId('demo-feed-row-6')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demo-file-claim'));
    expect(screen.getByTestId('claim-step-notify')).toBeInTheDocument();

    const claim = useStore.getState().claims[0];
    expect(claim.evidence).toHaveLength(12);
    expect(claim.evidence.filter((e) => e.status === 'auto')).toHaveLength(6);
  });

  it('near-miss runs land the 7-day window plus feed entry and credit', async () => {
    enrollCover();
    const creditsFor = () =>
      useStore
        .getState()
        .enrollments.filter((e) => e.agentId === 'procurement-bot')
        .flatMap((e) => e.credits).length;
    const creditsBefore = creditsFor();

    renderAt('/claim/demo');
    fireEvent.click(screen.getByTestId('run-demo-s-17'));
    await waitFor(() => expect(screen.getByTestId('demo-file-claim')).toBeEnabled());
    fireEvent.click(screen.getByTestId('demo-file-claim'));

    const state = useStore.getState();
    expect(state.claims[0].clockState.nearMiss).toBe(true);
    expect(state.nearMisses).toHaveLength(1);
    expect(creditsFor()).toBe(creditsBefore + 1);
  });

  it('an already-filed incident offers to open its claim instead', async () => {
    const state = useStore.getState();
    const incident = landIncident(state, 'S-09', 'procurement-bot');
    expect(incident).toBeDefined();
    const claimId = openClaimForIncident(useStore.getState(), incident!);

    renderAt(`/claim/demo/${incident!.id}`);
    await waitFor(() => expect(screen.getByTestId('demo-file-claim')).toBeEnabled());
    expect(screen.getByTestId('demo-file-claim')).toHaveTextContent('Open claim C-2026-0001');

    fireEvent.click(screen.getByTestId('demo-file-claim'));
    expect(screen.getByTestId('claim-step-notify')).toBeInTheDocument();
    // No duplicate claim was created.
    expect(useStore.getState().claims).toHaveLength(1);
    expect(useStore.getState().claims[0].id).toBe(claimId);
  });
});

describe('copy rules', () => {
  it('demo copy contains no colons, semicolons, or dashes', () => {
    const forbidden = /[:;‐‑‒–—-]/;
    const strings: string[] = [
      CLAIM_DEMO_COPY.entry,
      CLAIM_DEMO_COPY.title,
      CLAIM_DEMO_COPY.coverTitle,
      CLAIM_DEMO_COPY.coverBody('Procurement Bot'),
      CLAIM_DEMO_COPY.activate,
      CLAIM_DEMO_COPY.activationTitle,
      ...CLAIM_DEMO_COPY.activationSteps,
      CLAIM_DEMO_COPY.run,
      CLAIM_DEMO_COPY.pickerLossFigure('$60,000'),
      CLAIM_DEMO_COPY.pickerNearMissFigure('$2,400'),
      CLAIM_DEMO_COPY.detectionTitle,
      CLAIM_DEMO_COPY.feedTitle,
      CLAIM_DEMO_COPY.alertLine,
      CLAIM_DEMO_COPY.killLine,
      CLAIM_DEMO_COPY.freezeLine,
      CLAIM_DEMO_COPY.rotateLine,
      CLAIM_DEMO_COPY.lossLine('$60,000'),
      CLAIM_DEMO_COPY.investigationLine('$2,400'),
      CLAIM_DEMO_COPY.recordLine,
      CLAIM_DEMO_COPY.fileClaim,
      CLAIM_DEMO_COPY.chooseAnother,
      ...Object.values(CLAIM_DEMO_COPY.summaryLabels),
      // Scenario ids are identifiers, not copy — titles/summaries/outcomes are.
      ...CLAIM_DEMO_SCENARIOS.flatMap((s) => [s.title, s.summary, s.outcome]),
      ...Object.values(CLAIM_DEMO_FEED_EVENT),
      CLAIM_HISTORY_COPY.tabIncidents,
      CLAIM_HISTORY_COPY.tabHistory,
      CLAIM_HISTORY_COPY.empty,
      CLAIM_HISTORY_COPY.opened('14 August 2026'),
      CLAIM_HISTORY_COPY.statusPaid,
      CLAIM_HISTORY_COPY.statusDenied,
      CLAIM_HISTORY_COPY.statusApproved,
      CLAIM_HISTORY_COPY.statusInProgress,
      APPEAL_COPY.action,
      APPEAL_COPY.formTitle,
      APPEAL_COPY.formBody,
      APPEAL_COPY.groundsLabel,
      APPEAL_COPY.attach,
      APPEAL_COPY.submit,
      APPEAL_COPY.cancel,
      APPEAL_COPY.submittedTitle,
      APPEAL_COPY.submittedBody,
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });
});
