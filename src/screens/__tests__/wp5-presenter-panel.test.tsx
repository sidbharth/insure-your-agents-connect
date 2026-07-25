/**
 * WP-5 component tests — screen 7.12 Presenter panel:
 *  - inject buttons build incidents against the selected target agent with an
 *    optional loss override (REQ-7.12.1) and arm the presenter.
 *  - verification revoke/restore drive the operator's interval history.
 *  - price pin toggle (pin $3.00 / unpin).
 *  - fast-forward presets move the demo clock AND advance open-claim clocks;
 *    "miss a clock" marks the latest claim insurerMissed.
 *  - force states write suspensions with the mapped reasons; the
 *    concentration switch forces the Helios share above 40%.
 *  - reset from the panel restores the seed incl. pinned: false (AC-16).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { buildEvidenceChecklist, resetIncidentCounter } from '../../data/incidents';
import { HELIOS } from '../../data/seed';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';

function renderPanel() {
  useStore.getState().setPanelOpen(true);
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
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

describe('inject incident (REQ-7.12.1)', () => {
  it('renders all five scenario buttons and injects against the target agent', () => {
    renderPanel();
    for (const id of ['s-03', 's-09', 's-17', 's-18', 's-24']) {
      expect(screen.getByTestId(`inject-${id}`)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByTestId('inject-target-agent'), {
      target: { value: 'payables-bot' },
    });
    fireEvent.click(screen.getByTestId('inject-s-18'));
    const incident = useStore.getState().incidents[0];
    expect(incident.scenarioId).toBe('S-18');
    expect(incident.agentId).toBe('payables-bot');
    expect(incident.lossGrossUsd).toBe(35_000); // scenario default
    expect(useStore.getState().presenter.armed).toBe(true);
  });

  it('applies the editable loss override', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('inject-loss-input'), {
      target: { value: '77000' },
    });
    fireEvent.click(screen.getByTestId('inject-s-09'));
    expect(useStore.getState().incidents[0].lossGrossUsd).toBe(77_000);
  });
});

describe('verification control', () => {
  it('revoke closes the open verified interval; restore opens a new one', () => {
    renderPanel();
    const openVerified = () =>
      useStore
        .getState()
        .operator.verificationHistory.some((iv) => iv.verified && iv.to === undefined);

    expect(openVerified()).toBe(true);
    expect(screen.getByTestId('verification-restore')).toBeDisabled();
    fireEvent.click(screen.getByTestId('verification-revoke'));
    expect(openVerified()).toBe(false);
    expect(screen.getByTestId('verification-revoke')).toBeDisabled();
    fireEvent.click(screen.getByTestId('verification-restore'));
    expect(openVerified()).toBe(true);
  });
});

describe('price control', () => {
  it('pin sets $3.00; unpin returns to the live feed', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('price-pin-toggle'));
    expect(useStore.getState().priceFeed.pinned).toBe(true);
    expect(useStore.getState().priceFeed.usdPerN).toBe(3.0);
    fireEvent.click(screen.getByTestId('price-pin-toggle'));
    expect(useStore.getState().priceFeed.pinned).toBe(false);
  });
});

describe('time control', () => {
  it('fast-forward moves the demo clock and advances open claim clocks', () => {
    const s = useStore.getState();
    s.saveMandate('procurement-bot', testMandate());
    s.addEnrollment(testEnrollment({ agentId: 'procurement-bot' }));
    s.injectIncident('S-09', 'procurement-bot');
    const incident = useStore.getState().incidents[0];
    const claimId = useStore.getState().openClaim(incident.id);
    useStore
      .getState()
      .updateClaim(claimId, { evidence: buildEvidenceChecklist('S-09') });
    const claim = () => useStore.getState().claims.find((c) => c.id === claimId)!;
    const anchors = { ...claim().clockState.anchors, notifiedAt: demoNow() };
    const next = { ...claim().clockState, anchors };
    useStore
      .getState()
      .setClockState(claimId, { ...next, phase: phaseFromAnchors(next) });

    renderPanel();
    const before = useStore.getState().presenter.timeOffsetMs;
    fireEvent.click(screen.getByTestId('ff-5bd'));
    expect(useStore.getState().presenter.timeOffsetMs).toBeGreaterThan(before);
    // The 2-business-day acknowledgement window elapsed → anchor auto-filled.
    expect(claim().clockState.anchors.acknowledgedAt).toBeDefined();
    expect(claim().clockState.phase).toBe('Acknowledged');
  });

  it('miss-clock marks the latest claim insurerMissed', () => {
    const s = useStore.getState();
    s.injectIncident('S-09', 'procurement-bot');
    s.openClaim(useStore.getState().incidents[0].id);
    renderPanel();
    fireEvent.click(screen.getByTestId('miss-clock'));
    expect(useStore.getState().claims[0].clockState.insurerMissed).toBe(true);
  });
});

describe('force states', () => {
  it('logging lapse trips the gate and suspends with the mapped reason', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('force-logging-lapse'));
    const agent = useStore.getState().agents.find((a) => a.id === 'procurement-bot')!;
    expect(agent.controls.tier1.actionLogging).toBe(false);
    expect(
      agent.suspensionHistory.some(
        (iv) => iv.to === undefined && iv.reason === 'tier-1 logging lapse',
      ),
    ).toBe(true);
    // Toggle off: cure + unsuspend.
    fireEvent.click(screen.getByTestId('force-logging-lapse'));
    const cured = useStore.getState().agents.find((a) => a.id === 'procurement-bot')!;
    expect(cured.controls.tier1.actionLogging).toBe(true);
    expect(cured.suspensionHistory.every((iv) => iv.to !== undefined)).toBe(true);
  });

  it('hash mismatch and premium overdue suspend with their reasons', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('force-hash-mismatch'));
    fireEvent.click(screen.getByTestId('force-premium-overdue'));
    const agent = useStore.getState().agents.find((a) => a.id === 'procurement-bot')!;
    const openReasons = agent.suspensionHistory
      .filter((iv) => iv.to === undefined)
      .map((iv) => iv.reason);
    expect(openReasons).toContain('configuration hash mismatch');
    expect(openReasons).toContain('premium >15 days overdue');
  });

  it('concentration switch forces the Helios external caps above 40%', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('force-concentration'));
    const forced = useStore
      .getState()
      .book.components.find((c) => c.harness === HELIOS)!;
    expect(forced.externalCapsUsd).toBe(3_400_000);
    fireEvent.click(screen.getByTestId('force-concentration'));
    const restored = useStore
      .getState()
      .book.components.find((c) => c.harness === HELIOS)!;
    expect(restored.externalCapsUsd).toBe(2_090_000);
  });

  it('drop-book switch pushes the Helios external caps below 40% and back (AC-6)', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('drop-book'));
    const dropped = useStore
      .getState()
      .book.components.find((c) => c.harness === HELIOS)!;
    expect(dropped.externalCapsUsd).toBe(500_000);
    fireEvent.click(screen.getByTestId('drop-book'));
    const restored = useStore
      .getState()
      .book.components.find((c) => c.harness === HELIOS)!;
    expect(restored.externalCapsUsd).toBe(2_090_000);
  });
});

describe('panel reset (AC-16)', () => {
  it('restores the seed incl. pinned: false', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('price-pin-toggle'));
    fireEvent.click(screen.getByTestId('inject-s-03'));
    fireEvent.click(screen.getByTestId('ff-30d'));
    expect(useStore.getState().priceFeed.pinned).toBe(true);

    fireEvent.click(screen.getByTestId('presenter-reset'));
    const after = useStore.getState();
    expect(after.priceFeed.pinned).toBe(false);
    expect(after.incidents).toHaveLength(0);
    expect(after.presenter.timeOffsetMs).toBe(0);
    expect(after.presenter.armed).toBe(false);
  });
});
