/**
 * WP-2 tests — wizard screens 7.1–7.5 (plan §10 WP-2):
 *  - AC-2: tier-1 gate off ⇒ sidebar collapses to DECLINED naming the gate,
 *    Continue disabled; toggling back on restores the quote.
 *  - AC-3 a/b: attestation off ⇒ "+0.6% / No TEE attestation" ladder line
 *    AND Coverage B greys the same instant.
 *  - AC-4: all seven tier-2 off ⇒ ladder ceiling reached at exactly 3.0%.
 *  - REQ-7.4.2: cap edit moves the sidebar premium immediately.
 *  - REQ-7.4.1: Continue blocked until countersigned (with the literal
 *    T3.2 reason), then enabled after the countersign ceremony.
 *  - AC-8: edit mode renders the re-pricing sheet with delta figures and the
 *    visible pending-edit label; pay-difference applies the new version.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { resetWizardAgentId } from '../wizard/wizardAgent';

const AGENT_ID = 'procurement-bot';

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
  resetWizardAgentId();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

// ---------------------------------------------------------------------------
// 7.1 Get started
// ---------------------------------------------------------------------------

describe('7.1 Get started', () => {
  it('renders the positioning line, step strip, and footnote — no signup', () => {
    renderAt('/');
    expect(screen.getByTestId('screen-GetStarted')).toBeInTheDocument();
    expect(screen.getByTestId('step-strip')).toBeInTheDocument();
    expect(screen.getByTestId('role-cards')).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('Get started navigates to the company step', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('get-started'));
    expect(screen.getByTestId('screen-VerifyCompany')).toBeInTheDocument();
  });

  it('renames the company through the store', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('company-name'));
    const input = screen.getByTestId('company-name-input');
    fireEvent.change(input, { target: { value: 'Acme Autonomy Ltd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().operator.name).toBe('Acme Autonomy Ltd');
  });

  it('an emptied company name falls back to the default', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('company-name'));
    const input = screen.getByTestId('company-name-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().operator.name).toBe('Acme, Inc');
  });
});

// ---------------------------------------------------------------------------
// 7.2 Verify your company
// ---------------------------------------------------------------------------

describe('7.2 Verify your company', () => {
  it('verify ceremony ends in a green Verified badge with timestamp', async () => {
    renderAt('/verify');
    fireEvent.click(screen.getByTestId('verify-company'));
    await waitFor(() =>
      expect(screen.getByTestId('kyb-verified-badge')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('kyb-verified-timestamp')).toBeInTheDocument();
  });

  it('skip states both consequences in one breath and never says mandatory', () => {
    renderAt('/verify');
    fireEvent.click(screen.getByTestId('skip-for-now'));
    const card = screen.getByTestId('skip-consequences');
    expect(card.textContent).toMatch(/\+0\.4%/);
    expect(card.textContent).toMatch(/no claim/i);
    expect(card.textContent).not.toMatch(/mandatory/i);
  });

  it('continue unverified closes the open verified interval', () => {
    renderAt('/verify');
    fireEvent.click(screen.getByTestId('skip-for-now'));
    fireEvent.click(screen.getByTestId('continue-unverified'));
    // revokeVerification closes the open interval — none stays open
    const open = useStore
      .getState()
      .operator.verificationHistory.find((iv) => iv.verified && iv.to === undefined);
    expect(open).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7.3 Connect your agent
// ---------------------------------------------------------------------------

describe('7.3 Connect your agent', () => {
  it('sample-agent path: registration → identity card → ownership challenge → verified', async () => {
    renderAt('/connect');
    fireEvent.click(screen.getByTestId('connect-sample'));
    await waitFor(() =>
      expect(screen.getByTestId('agent-identity-card')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('fingerprint-covers').textContent).toMatch(
      /harness code/i,
    );
    expect(screen.getByTestId('ownership-challenge')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('send-challenge'));
    await waitFor(() =>
      expect(screen.getByTestId('signature-verified')).toBeInTheDocument(),
    );
    expect(
      useStore.getState().agents.find((a) => a.id === AGENT_ID)?.ownershipVerified,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7.4 Mandate — cap edits re-price; countersign gates Continue
// ---------------------------------------------------------------------------

describe('7.4 Mandate', () => {
  it('editing the per-transaction cap moves the sidebar premium immediately (REQ-7.4.2)', () => {
    renderAt('/mandate');
    // all controls on + operator verified ⇒ 0.6% of $50,000 = $300/yr
    expect(screen.getByTestId('sidebar-premium').textContent).toContain('$300');
    fireEvent.change(screen.getByTestId('cap-perTx'), {
      target: { value: '100000' },
    });
    expect(screen.getByTestId('sidebar-premium').textContent).toContain('$600');
  });

  it('open-set toggle shows the +0.3% loading note', () => {
    renderAt('/mandate');
    expect(screen.queryByTestId('open-set-loading-note')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-set-toggle'));
    expect(screen.getByTestId('open-set-loading-note').textContent).toContain('+0.3%');
  });

  it('Continue is blocked until countersigned, then enabled (REQ-7.4.1)', async () => {
    renderAt('/mandate');
    expect(screen.getByTestId('mandate-continue')).toBeDisabled();
    expect(screen.getByTestId('continue-gate-reason').textContent).toContain(
      "Cover requires the Principal's countersignature",
    );
    expect(screen.getByTestId('s31-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('send-countersign'));
    await waitFor(() =>
      expect(screen.getByTestId('countersigned-card')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('countersign-toast').textContent).toContain(
      'Aria Chen',
    );
    expect(screen.getByTestId('mandate-continue')).toBeEnabled();
    expect(screen.queryByTestId('continue-gate-reason')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7.5 Safety controls — THE centerpiece
// ---------------------------------------------------------------------------

describe('7.5 Safety controls', () => {
  it('tier-1 gate off ⇒ DECLINED naming the gate + Continue disabled; on again restores (AC-2)', () => {
    renderAt('/controls');
    expect(screen.getByTestId('quote-sidebar')).toHaveAttribute(
      'data-state',
      'quoted',
    );
    expect(screen.getByTestId('controls-continue')).toBeEnabled();

    fireEvent.click(screen.getByTestId('gate-actionLogging'));
    const sidebar = screen.getByTestId('quote-sidebar');
    expect(sidebar).toHaveAttribute('data-state', 'declined');
    expect(screen.getByTestId('decline-reason').textContent).toContain(
      'action logging',
    );
    expect(screen.getByTestId('controls-continue')).toBeDisabled();

    fireEvent.click(screen.getByTestId('gate-actionLogging'));
    expect(screen.getByTestId('quote-sidebar')).toHaveAttribute(
      'data-state',
      'quoted',
    );
    expect(screen.getByTestId('controls-continue')).toBeEnabled();
  });

  it('the hash-identity gate is locked on', () => {
    renderAt('/controls');
    expect(screen.getByTestId('gate-hashIdentity')).toBeDisabled();
    expect(screen.getByTestId('gate-hashIdentity')).toBeChecked();
  });

  it('attestation off ⇒ +0.6% ladder line AND Coverage B greys the same instant (AC-3)', () => {
    renderAt('/controls');
    expect(screen.getByTestId('coverage-card-B')).toHaveAttribute(
      'data-active',
      'true',
    );
    fireEvent.click(screen.getByTestId('tier2-attestation'));
    // a) the surcharge line appears on the ladder legend
    expect(screen.getAllByText('No TEE attestation').length).toBeGreaterThan(0);
    // b) Coverage B greys with the reason
    expect(screen.getByTestId('coverage-card-B')).toHaveAttribute(
      'data-active',
      'false',
    );
    // premium: (0.6 + 0.6)% × $50,000 = $600
    expect(screen.getByTestId('sidebar-premium').textContent).toContain('$600');
    // consequence chip on the row
    expect(
      screen.getByTestId('tier2-consequence-attestation'),
    ).toBeInTheDocument();
  });

  it('all seven tier-2 off ⇒ ladder ceiling reached at exactly 3.0% (AC-4)', () => {
    renderAt('/controls');
    for (const key of [
      'attestation',
      'kyb',
      'timelock',
      'recovery',
      'harnessAudit',
      'hitl',
      'killSwitch',
    ]) {
      fireEvent.click(screen.getByTestId(`tier2-${key}`));
    }
    expect(screen.getByTestId('ceiling-reached')).toBeInTheDocument();
    // 3.0% × $50,000 = $1,500 — never more
    expect(screen.getByTestId('sidebar-premium').textContent).toContain('$1,500');
    expect(screen.getByTestId('ceiling-note')).toBeInTheDocument();
  });

  it('unverified company prices the KYB row as skipped no matter the toggle', () => {
    useStore.getState().revokeVerification();
    renderAt('/controls');
    expect(screen.getByTestId('kyb-mirror-note')).toBeInTheDocument();
    // kyb agent toggle still on, but priced off: (0.6 + 0.4)% × $50,000 = $500
    expect(screen.getByTestId('tier2-kyb')).toBeChecked();
    expect(screen.getByTestId('sidebar-premium').textContent).toContain('$500');
  });
});

// ---------------------------------------------------------------------------
// Mandate edit mode (AC-8) — re-pricing sheet
// ---------------------------------------------------------------------------

describe('7.4 edit mode (/mandate?edit=:agentId)', () => {
  it('save-reprice opens the sheet with delta figures and the pending label', () => {
    renderAt(`/mandate?edit=${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('save-reprice'));

    expect(screen.getByTestId('repricing-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('pending-edit-label')).toBeInTheDocument();
    // annualized difference: 0.6% × ($100k − $50k) = +$300
    expect(screen.getByTestId('annual-delta').textContent).toContain('300');
    expect(screen.getByTestId('due-now-delta')).toBeInTheDocument();
    expect(screen.getByTestId('takes-effect-note').textContent).toMatch(
      /only after payment/i,
    );
    expect(useStore.getState().pendingEdits[AGENT_ID]).toBeDefined();
  });

  it('pay difference commits the new mandate version', async () => {
    renderAt(`/mandate?edit=${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('save-reprice'));
    fireEvent.click(screen.getByTestId('pay-difference'));

    await waitFor(() =>
      expect(screen.getByTestId('edit-applied')).toBeInTheDocument(),
    );
    // The success copy names the version that was actually closed (v1.0),
    // not the just-applied one (regression: `live` re-derives after commit).
    expect(screen.getByTestId('edit-applied').textContent).toContain(
      'previous version (v1.0)',
    );
    const versions = useStore.getState().mandates[AGENT_ID];
    const latest = versions[versions.length - 1];
    expect(latest.version).toBe('1.1');
    expect(latest.caps.perTx).toBe(100000);
    // previous version closed
    expect(versions[versions.length - 2].inForceTo).toBeDefined();
    expect(useStore.getState().pendingEdits[AGENT_ID]).toBeUndefined();
  });

  it('pay difference re-prices the live enrollment (dashboard premium updates)', async () => {
    const { prepareImportedAgent, enrollAgent } = await import('../purchase/enroll');
    prepareImportedAgent(AGENT_ID);
    enrollAgent(AGENT_ID);
    expect(
      useStore.getState().enrollments.find((e) => e.agentId === AGENT_ID)?.premiumUsd,
    ).toBe(300); // 0.6% × $50,000

    renderAt(`/mandate?edit=${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('edit-cap-perTx'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('save-reprice'));
    fireEvent.click(screen.getByTestId('pay-difference'));
    await waitFor(() =>
      expect(screen.getByTestId('edit-applied')).toBeInTheDocument(),
    );

    const enrollment = useStore
      .getState()
      .enrollments.find((e) => e.agentId === AGENT_ID && e.terminatedAt === undefined);
    expect(enrollment?.premiumUsd).toBe(600); // 0.6% × $100,000
    expect(enrollment?.mandateVersion).toBe('1.1');
  });
});
