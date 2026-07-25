/**
 * WP-4 tests — screen 7.10 coverage detail + Scenario Explorer:
 *  - REQ-7.10.1: eight scenarios, at least two ending in denial.
 *  - REQ-7.10.2: each verdict names the verdict, the route, one clause-level
 *    reason, and the control that made the difference.
 *  - AC-3c: scenario 2 flips Covered(B) → Denied-as-unprovable via the
 *    "what if no attestation?" toggle, AND independently when the selected
 *    target agent has no attestation operative at event time (Legacy-Bot).
 *  - Coverage detail binds sublimits to the real cap; Coverage B greys when
 *    attestation is not operative; /coverage?view=scenarios renders the
 *    explorer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { testEnrollment } from '../../lib/__tests__/fixtures';
import { DENIED_SCENARIO_COUNT, SCENARIOS } from '../../data/scenarios';

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
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

describe('scenario library (data)', () => {
  it('has eight scenarios with at least two denials (REQ-7.10.1)', () => {
    expect(SCENARIOS).toHaveLength(8);
    const denied = SCENARIOS.filter((s) => s.pickerVerdict === 'Denied');
    expect(denied.length).toBeGreaterThanOrEqual(2);
    expect(denied.length).toBe(DENIED_SCENARIO_COUNT);
  });

  it('every verdict names a headline, route, clause-level reason and control (REQ-7.10.2)', () => {
    for (const s of SCENARIOS) {
      const v = s.verdict({ capUsd: 50_000, attested: true });
      expect(v.headline).toBeTruthy();
      expect(v.routeLine).toBeTruthy();
      expect(v.reason).toBeTruthy();
      expect(v.clause).toBeTruthy();
      expect(v.control).toBeTruthy();
    }
  });
});

describe('7.10 Scenario Explorer', () => {
  it('renders under /coverage?view=scenarios with all eight picker items', () => {
    renderAt('/coverage?view=scenarios');
    expect(screen.getByTestId('screen-ScenarioExplorer')).toBeInTheDocument();
    for (let n = 1; n <= 8; n++) {
      expect(screen.getByTestId(`scenario-item-${n}`)).toBeInTheDocument();
    }
  });

  it('selecting a denied scenario shows a decisive denial with route, reason and control', () => {
    renderAt('/coverage?view=scenarios');
    fireEvent.click(screen.getByTestId('scenario-item-5'));

    const card = screen.getByTestId('scenario-verdict-card');
    expect(card).toHaveAttribute('data-covered', 'false');
    expect(screen.getByTestId('verdict-headline').textContent).toMatch(
      /Not covered: model conduct/,
    );
    expect(screen.getByTestId('verdict-route').textContent).toBeTruthy();
    expect(screen.getByTestId('verdict-reason').textContent).toBeTruthy();
    expect(screen.getByTestId('verdict-control').textContent).toBeTruthy();
  });

  it('AC-3c: the no-attestation toggle flips scenario 2 from Covered(B) to Denied-as-unprovable', () => {
    renderAt('/coverage?view=scenarios');
    fireEvent.click(screen.getByTestId('scenario-item-2'));

    expect(screen.getByTestId('scenario-verdict-card')).toHaveAttribute(
      'data-covered',
      'true',
    );
    expect(screen.getByTestId('verdict-headline').textContent).toMatch(
      /Covered under Coverage B/,
    );

    const toggle = screen.getByTestId('no-attestation-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    expect(screen.getByTestId('scenario-verdict-card')).toHaveAttribute(
      'data-covered',
      'false',
    );
    expect(screen.getByTestId('verdict-headline').textContent).toMatch(
      /Denied: unprovable without attestation/,
    );
    expect(screen.getByTestId('verdict-reason').textContent).toMatch(/attestation/i);

    // flipping back restores the covered verdict
    fireEvent.click(toggle);
    expect(screen.getByTestId('scenario-verdict-card')).toHaveAttribute(
      'data-covered',
      'true',
    );
  });

  it("AC-3c: an attestation-less target agent yields the denial from the agent's real state", () => {
    // Enroll two agents so the picker offers a real choice: one attested,
    // one (Legacy-Bot) with no attestation interval ever opened.
    useStore.getState().addEnrollment(testEnrollment({ agentId: 'procurement-bot' }));
    useStore.getState().addEnrollment(testEnrollment({ agentId: 'legacy-bot' }));

    renderAt('/coverage?view=scenarios');
    fireEvent.click(screen.getByTestId('scenario-item-2'));
    expect(screen.getByTestId('scenario-verdict-card')).toHaveAttribute(
      'data-covered',
      'true',
    );

    fireEvent.change(screen.getByTestId('scenario-target-agent'), {
      target: { value: 'legacy-bot' },
    });

    // no toggle needed — the agent's reality drives the verdict
    expect(screen.getByTestId('no-attestation-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByTestId('scenario-verdict-card')).toHaveAttribute(
      'data-covered',
      'false',
    );
    expect(screen.getByTestId('verdict-headline').textContent).toMatch(
      /Denied: unprovable without attestation/,
    );
    expect(screen.getByTestId('agent-attestation-state').textContent).toMatch(
      /no attestation operative at event time/i,
    );
  });

  it('the counterfactual toggle resets when switching scenarios', () => {
    renderAt('/coverage?view=scenarios');
    fireEvent.click(screen.getByTestId('scenario-item-2'));
    fireEvent.click(screen.getByTestId('no-attestation-toggle'));
    fireEvent.click(screen.getByTestId('scenario-item-1'));
    fireEvent.click(screen.getByTestId('scenario-item-2'));
    expect(screen.getByTestId('no-attestation-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('7.10 coverage detail', () => {
  it('pre-purchase shows quote-stage numbers and the six cards', () => {
    renderAt('/coverage');
    expect(screen.getByTestId('screen-Coverage')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-quote-stage')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-cards')).toBeInTheDocument();
    expect(screen.getByTestId('limits-picture')).toBeInTheDocument();
  });

  it('post-purchase binds sublimits to the real cap (E = 50%, F = 15%)', () => {
    useStore.getState().addEnrollment(testEnrollment({ agentId: 'procurement-bot' }));
    renderAt('/coverage');
    expect(screen.getByTestId('coverage-active-since')).toBeInTheDocument();

    const sublimits = screen.getByTestId('coverage-sublimits');
    expect(within(sublimits).getByTestId('sublimit-A').textContent).toMatch(/\$50,000/);
    expect(within(sublimits).getByTestId('sublimit-E').textContent).toMatch(/\$25,000/);
    expect(within(sublimits).getByTestId('sublimit-F').textContent).toMatch(/\$7,500/);
  });

  it('Coverage B greys with the reason when attestation is not operative', () => {
    useStore.getState().addEnrollment(testEnrollment({ agentId: 'legacy-bot' }));
    renderAt('/coverage');
    const cardB = screen.getByTestId('coverage-card-B');
    expect(within(cardB).getByTestId('grey-reason')).toBeInTheDocument();
  });

  it('"Test a scenario" opens the Scenario Explorer', () => {
    renderAt('/coverage');
    fireEvent.click(screen.getByTestId('test-a-scenario'));
    expect(screen.getByTestId('screen-ScenarioExplorer')).toBeInTheDocument();
  });
});
