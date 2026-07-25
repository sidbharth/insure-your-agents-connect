/**
 * WP-5 component tests — screen 7.11 File a claim:
 *  - empty state process map + "ask your presenter to break something".
 *  - incident inbox opens a claim with the 12-item checklist from the §5d
 *    applicability matrix; AC-9 UI: 6 auto per scenario, N/A greyed and never
 *    gating, the ring counts applicable only.
 *  - the full happy path S-03: notify → contain → evidence → clocks
 *    (fast-forward fills insurer anchors) → outcome pays exactly $10,000.
 *  - REQ-7.11.3: a presenter-edited loss recomputes the payout on screen.
 *  - AC-10: the S-24 model-conduct denial letter renders the Coverage-B
 *    counterfactual sentence.
 *  - AC-13: condition-precedent denial carries the forward-looking
 *    "Complete verification" action; restore → new inject → green banner.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { CLAIM_EMPTY_STATE, DENIAL_MODEL_CONDUCT } from '../../data/copy';
import {
  buildEvidenceChecklist,
  EVIDENCE_MATRIX,
  resetIncidentCounter,
} from '../../data/incidents';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { setLatencyTestMode } from '../../lib/latency';
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

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  setLatencyTestMode(true);
  useStore.getState().reset();
  resetIncidentCounter();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

/** Enroll + mandate in force + pinned $3.00 (seed enrollments are empty). */
function enroll(agentId = 'procurement-bot'): void {
  const s = useStore.getState();
  s.saveMandate(agentId, testMandate());
  s.addEnrollment(testEnrollment({ agentId }));
  s.pinPrice();
}

/** Inject a scenario and open its claim with the checklist populated. */
function openClaimFor(scenarioId: ScenarioId, lossUsd?: number): string {
  const s = useStore.getState();
  s.injectIncident(scenarioId, 'procurement-bot', lossUsd);
  const incident = useStore.getState().incidents.at(-1)!;
  const claimId = useStore.getState().openClaim(incident.id);
  useStore
    .getState()
    .updateClaim(claimId, { evidence: buildEvidenceChecklist(scenarioId) });
  return claimId;
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

describe('empty state and inbox', () => {
  it('renders the process map and the presenter prompt with no incidents', () => {
    renderAt('/claim');
    expect(screen.getByTestId('screen-Claim')).toBeInTheDocument();
    expect(screen.getByTestId('claim-empty-state')).toHaveTextContent(CLAIM_EMPTY_STATE);
    for (const label of ['Notify', 'Contain', 'Evidence', 'Clocks & decision', 'Outcome']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('opens a claim from the inbox with the checklist populated', () => {
    enroll();
    useStore.getState().injectIncident('S-09', 'procurement-bot');
    const incident = useStore.getState().incidents[0];
    renderAt('/claim');
    expect(screen.getByTestId('incident-inbox')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`open-claim-${incident.id}`));
    const claim = useStore.getState().claims[0];
    expect(claim.evidence).toHaveLength(12);
    expect(claim.evidence.filter((e) => e.status === 'auto')).toHaveLength(6);
    // Navigated into the flow at step 1.
    expect(screen.getByTestId('claim-step-notify')).toBeInTheDocument();
  });

  it('near-miss claims run on the 7-day window', () => {
    enroll();
    useStore.getState().injectIncident('S-17', 'procurement-bot');
    const incident = useStore.getState().incidents[0];
    renderAt('/claim');
    fireEvent.click(screen.getByTestId(`open-claim-${incident.id}`));
    expect(useStore.getState().claims[0].clockState.nearMiss).toBe(true);
    expect(screen.getByText('Notification window, 7 days')).toBeInTheDocument();
  });
});

describe('evidence step UI (AC-9)', () => {
  it('shows 6 auto-attached, greys N/A rows, ring counts applicable only', () => {
    enroll();
    const claimId = openClaimFor('S-03');
    // Move past notify so the resume logic still lands us at step 2 → walk to 3.
    renderAt(`/claim/${claimId}`);
    fireEvent.click(screen.getByTestId('notify-programme'));
    fireEvent.click(screen.getByTestId('contain-confirm-imaging'));
    fireEvent.click(screen.getByTestId('contain-continue'));

    expect(screen.getByTestId('evidence-auto-count')).toHaveTextContent(
      '6 items auto-attached',
    );
    const matrix = EVIDENCE_MATRIX['S-03'];
    for (const naId of matrix.notApplicable) {
      const row = screen.getByTestId(`evidence-item-${naId}`);
      expect(row).toHaveAttribute('data-status', 'notApplicable');
      expect(row.className).toContain('opacity-60');
      expect(within(row).getByText('not applicable to this claim')).toBeInTheDocument();
    }
    // Ring counts applicable only: 6 auto of 9 applicable for S-03.
    expect(screen.getByTestId('evidence-ring-caption')).toHaveTextContent(
      '6 of 9 attached',
    );
  });

  it('attaching all uploadables and submitting completes the package', async () => {
    enroll();
    const claimId = openClaimFor('S-03');
    renderAt(`/claim/${claimId}`);
    fireEvent.click(screen.getByTestId('notify-programme'));
    fireEvent.click(screen.getByTestId('contain-confirm-imaging'));
    fireEvent.click(screen.getByTestId('contain-continue'));

    for (const id of EVIDENCE_MATRIX['S-03'].upload) {
      fireEvent.click(screen.getByTestId(`evidence-attach-${id}`));
      await waitFor(() =>
        expect(screen.getByTestId(`evidence-item-${id}`)).toHaveAttribute(
          'data-status',
          'uploaded',
        ),
      );
    }
    expect(screen.getByTestId('evidence-ring-caption')).toHaveTextContent(
      '9 of 9 attached',
    );
    fireEvent.click(screen.getByTestId('evidence-submit'));
    const claim = useStore.getState().claims[0];
    // notApplicable never gated completion — completeness stamped at submit.
    expect(claim.clockState.anchors.packageReceivedAt).toBeDefined();
    expect(claim.clockState.anchors.packageCompleteAt).toBeDefined();
    expect(claim.clockState.phase).toBe('PackageComplete');
  });
});

describe('clocks and outcome — happy path S-03', () => {
  it('fast-forwards to determination and pays exactly $10,000', async () => {
    enroll();
    const claimId = openClaimFor('S-03');
    renderAt(`/claim/${claimId}`);
    fireEvent.click(screen.getByTestId('notify-programme'));
    fireEvent.click(screen.getByTestId('contain-confirm-imaging'));
    fireEvent.click(screen.getByTestId('contain-continue'));
    for (const id of EVIDENCE_MATRIX['S-03'].upload) {
      fireEvent.click(screen.getByTestId(`evidence-attach-${id}`));
      await waitFor(() =>
        expect(screen.getByTestId(`evidence-item-${id}`)).toHaveAttribute(
          'data-status',
          'uploaded',
        ),
      );
    }
    fireEvent.click(screen.getByTestId('evidence-submit'));

    // Step 4: conditions pass at event time.
    expect(screen.getByTestId('conditions-banner')).toHaveTextContent(
      'Conditions precedent passed as of event time',
    );
    expect(screen.getByTestId('clocks-continue')).toBeDisabled();

    // Fast-forward: ack window, then the 30-day determination window.
    fireEvent.click(screen.getByTestId('fast-forward'));
    await waitFor(() =>
      expect(screen.getByTestId('clock-node-1')).toHaveAttribute('data-met', 'true'),
    );
    fireEvent.click(screen.getByTestId('fast-forward'));
    await waitFor(() =>
      expect(screen.getByTestId('clock-node-3')).toHaveAttribute('data-met', 'true'),
    );
    expect(screen.getByTestId('clocks-continue')).toBeEnabled();
    fireEvent.click(screen.getByTestId('clocks-continue'));

    // Outcome: quantum = $60,000 − $50,000 cap; retention + coinsurance waived.
    expect(screen.getByTestId('outcome-verdict')).toHaveTextContent(
      'Covered: payment approved',
    );
    expect(screen.getByTestId('outcome-loss')).toHaveTextContent('$10,000');
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$10,000');
    expect(screen.getByTestId('outcome-payout-n')).toHaveTextContent('1 $NEAR = $3.00');

    const walletBefore = useStore.getState().operator.walletBalance;
    fireEvent.click(screen.getByTestId('accept-payment'));
    await waitFor(() =>
      expect(screen.getByTestId('payment-accepted')).toBeInTheDocument(),
    );
    expect(useStore.getState().operator.walletBalance).toBeCloseTo(
      walletBefore + 10_000 / 3,
      6,
    );
    expect(useStore.getState().claims[0].clockState.phase).toBe('Paid');
  });
});

describe('edited loss recomputes on screen (REQ-7.11.3)', () => {
  it('S-09 injected at $40,000 shows a $38,500 payout', () => {
    enroll();
    const claimId = openClaimFor('S-09', 40_000);
    stampDetermined(claimId);
    renderAt(`/claim/${claimId}`);
    expect(screen.getByTestId('outcome-loss')).toHaveTextContent('$40,000');
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$38,500');
  });
});

describe('S-18 recovery waterfall', () => {
  it('routes the scripted $10,000 recovery to the insurer first', async () => {
    enroll();
    const claimId = openClaimFor('S-18');
    stampDetermined(claimId);
    renderAt(`/claim/${claimId}`);
    expect(screen.getByTestId('outcome-payout')).toHaveTextContent('$33,500');
    const waterfall = screen.getByTestId('recovery-waterfall');
    expect(waterfall).toHaveTextContent('$10,000 recovered by tracing');
    expect(waterfall).toHaveTextContent('$10,000');

    fireEvent.click(screen.getByTestId('accept-payment'));
    await waitFor(() =>
      expect(screen.getByTestId('payment-accepted')).toBeInTheDocument(),
    );
    const claim = useStore.getState().claims[0];
    expect(claim.recovery?.waterfall.toInsurerUsd).toBe(10_000);
    expect(claim.recovery?.waterfall.toInsuredRetainedUsd).toBe(0);
  });
});

describe('S-24 model-conduct denial (AC-10)', () => {
  it('renders the letter with the Coverage-B counterfactual', () => {
    enroll();
    const claimId = openClaimFor('S-24');
    stampDetermined(claimId);
    renderAt(`/claim/${claimId}`);
    expect(screen.getByTestId('denial-letter')).toBeInTheDocument();
    const counterfactual = screen.getByTestId('coverage-b-counterfactual');
    expect(counterfactual).toHaveAttribute(
      'data-component-id',
      'coverage-b-counterfactual',
    );
    expect(counterfactual).toHaveTextContent(DENIAL_MODEL_CONDUCT.counterfactual);
    expect(screen.getByTestId('determination-summary')).toHaveTextContent(
      'Not covered: model conduct',
    );
    expect(screen.getByTestId('determination-summary')).toHaveTextContent('$0 (0 $NEAR)');
  });
});

describe('condition-precedent denial and restore (AC-13)', () => {
  it('revoked verification → red banner, denial letter with the forward action', () => {
    enroll();
    useStore.getState().revokeVerification();
    const claimId = openClaimFor('S-09');
    renderAt(`/claim/${claimId}`);
    fireEvent.click(screen.getByTestId('notify-programme'));
    fireEvent.click(screen.getByTestId('contain-confirm-imaging'));
    fireEvent.click(screen.getByTestId('contain-continue'));
    fireEvent.click(screen.getByTestId('evidence-submit'));

    expect(screen.getByTestId('conditions-banner')).toHaveTextContent(
      'failed as of event time',
    );
    expect(screen.getByTestId('conditions-banner')).toHaveTextContent(
      'verification not current at event time',
    );
    fireEvent.click(screen.getByTestId('clocks-continue'));

    expect(screen.getByTestId('denial-letter')).toHaveTextContent(
      'Our determination is that this claim is not payable.',
    );
    const forward = screen.getByTestId('condition-forward-action');
    expect(within(forward).getByTestId('complete-verification-action')).toHaveTextContent(
      'Complete verification',
    );
  });

  it('restore → a NEW injection proceeds while the old event stays denied', () => {
    enroll();
    useStore.getState().revokeVerification();
    // Separate the interval boundaries on the demo clock: an event injected
    // at the same millisecond as the restore would land inside the new
    // verified interval ([from, to) with from <= t).
    useStore.getState().advanceTime(1_000);
    const deniedClaim = openClaimFor('S-09');
    useStore.getState().advanceTime(1_000);
    useStore.getState().verifyOperator();
    const coveredClaim = openClaimFor('S-09');
    stampDetermined(coveredClaim);

    renderAt(`/claim/${coveredClaim}`);
    expect(screen.getByTestId('outcome-verdict')).toHaveTextContent(
      'Covered: payment approved',
    );
    cleanup();

    // The earlier event is still adjudicated inside the unverified interval.
    stampDetermined(deniedClaim);
    renderAt(`/claim/${deniedClaim}`);
    expect(screen.getByTestId('denial-letter')).toHaveTextContent(
      'verification not current at event time',
    );
  });
});
