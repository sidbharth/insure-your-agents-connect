/**
 * Spending rules page (/rules/:agentId) — the self-serve mandate editor:
 *  - the per payment limit is read-only and framed as the cover amount.
 *  - daily and thirty day limits, the payee list, and the approval
 *    threshold are editable; review shows exactly what changed.
 *  - applying commits a new countersigned mandate version into force
 *    through the store's real machinery.
 *  - rules copy obeys the punctuation rule (no colons, semicolons, dashes).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { RULES_COPY } from '../../data/copy';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { newestMandate } from '../portfolio/helpers';

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
  const s = useStore.getState();
  s.saveMandate(AGENT_ID, testMandate());
  s.addEnrollment(testEnrollment({ agentId: AGENT_ID }));
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

describe('spending rules', () => {
  it('shows the cover amount read only and the editable rules', () => {
    renderAt(`/rules/${AGENT_ID}`);
    expect(screen.getByTestId('screen-RulesEdit')).toBeInTheDocument();
    expect(screen.getByTestId('rules-cover')).toHaveTextContent('$50,000');
    expect(screen.getByTestId('rules-daily')).toBeInTheDocument();
    expect(screen.getByTestId('rules-payees')).toBeInTheDocument();
    expect(screen.getByTestId('rules-approval')).toBeInTheDocument();
  });

  it('review lists exactly what changed and apply brings it into force', async () => {
    renderAt(`/rules/${AGENT_ID}`);
    const before = newestMandate(useStore.getState().mandates[AGENT_ID])!;

    fireEvent.change(screen.getByTestId('rules-daily'), { target: { value: '80000' } });
    fireEvent.change(screen.getByTestId('rules-payee-name'), {
      target: { value: 'Harbor Freight Ltd' },
    });
    fireEvent.change(screen.getByTestId('rules-payee-address'), {
      target: { value: '0xabc1230000000000000000000000000000000001' },
    });
    fireEvent.click(screen.getByTestId('rules-add-payee'));

    fireEvent.click(screen.getByTestId('rules-review'));
    const changes = screen.getByTestId('rules-changes');
    expect(changes).toHaveTextContent('Daily limit');
    expect(changes).toHaveTextContent('$80,000');
    expect(changes).toHaveTextContent(RULES_COPY.addedPayee('Harbor Freight Ltd'));

    fireEvent.click(screen.getByTestId('rules-apply'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-Policies')).toBeInTheDocument(),
    );

    const after = newestMandate(useStore.getState().mandates[AGENT_ID])!;
    expect(after.version).not.toBe(before.version);
    expect(after.caps.daily).toBe(80_000);
    expect(after.caps.perTx).toBe(before.caps.perTx); // cover amount untouched
    expect(after.whitelist.entries.some((p) => p.name === 'Harbor Freight Ltd')).toBe(true);
    expect(after.countersigned).toBeDefined();
    expect(after.inForceFrom).toBeDefined();
    // The previous version closed when the new one came into force.
    const versions = useStore.getState().mandates[AGENT_ID];
    expect(versions[versions.length - 2].inForceTo).toBeDefined();
  });

  it('apply stays locked when nothing changed', () => {
    renderAt(`/rules/${AGENT_ID}`);
    fireEvent.click(screen.getByTestId('rules-review'));
    expect(screen.getByTestId('rules-apply')).toBeDisabled();
    expect(screen.getByText(RULES_COPY.noChanges)).toBeInTheDocument();
  });

  it('a fresh payee carries the 24 hour wait chip and can be removed', () => {
    renderAt(`/rules/${AGENT_ID}`);
    fireEvent.change(screen.getByTestId('rules-payee-name'), {
      target: { value: 'New Vendor' },
    });
    fireEvent.change(screen.getByTestId('rules-payee-address'), {
      target: { value: '0xdef4560000000000000000000000000000000002' },
    });
    fireEvent.click(screen.getByTestId('rules-add-payee'));
    expect(screen.getByTestId('rules-payees')).toHaveTextContent(RULES_COPY.cooling);

    fireEvent.click(screen.getByTestId('rules-remove-0xdef456'));
    expect(screen.getByTestId('rules-payees')).not.toHaveTextContent('New Vendor');
  });

  it('rules copy contains no colons, semicolons, or dashes', () => {
    const forbidden = /[:;‐‑‒–—-]/;
    const strings: string[] = [
      RULES_COPY.title,
      RULES_COPY.sub('procurement agent'),
      RULES_COPY.coverLabel,
      RULES_COPY.coverNote,
      RULES_COPY.limitsTitle,
      RULES_COPY.daily,
      RULES_COPY.monthly,
      RULES_COPY.limitsNote,
      RULES_COPY.payeesTitle,
      RULES_COPY.payeesNote,
      RULES_COPY.payeeName,
      RULES_COPY.payeeAddress,
      RULES_COPY.addPayee,
      RULES_COPY.remove,
      RULES_COPY.cooling,
      RULES_COPY.approvalTitle,
      RULES_COPY.approvalLabel,
      RULES_COPY.approvalNote,
      RULES_COPY.review,
      RULES_COPY.changesTitle,
      RULES_COPY.noChanges,
      RULES_COPY.apply,
      RULES_COPY.back,
      RULES_COPY.theaterTitle,
      ...RULES_COPY.steps,
      RULES_COPY.addedPayee('Harbor Freight Ltd'),
      RULES_COPY.removedPayee('Harbor Freight Ltd'),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });
});
