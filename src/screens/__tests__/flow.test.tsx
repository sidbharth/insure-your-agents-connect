/**
 * Connect flow tests — the variant's single purchase flow:
 *  - landing card opens the agent picker with the five .sidb.near agents.
 *  - connecting prices real enrollments (Quoted, unpaid) and lands on the
 *    connected agents screen after processing.
 *  - quote totals are the plain sums; legacy.sidb.near carries the
 *    Coverage B excluded chip.
 *  - payment choice starts the six coverage disclosures; agreeing through
 *    A to F reaches the signature page; signing collects the premium and
 *    activates cover, landing on the policies dashboard.
 *  - deep links without a connection restart the flow at the landing card.
 *  - flow copy obeys the punctuation rule (no colons, semicolons, dashes).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { FLOW_COPY, FLOW_TERMS } from '../../data/copy';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { CONNECTABLE_AGENT_IDS, resetFlowState } from '../flow/flowState';

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
  resetFlowState();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

/** Landing → picker → connect the given agents → agents screen. */
async function connectAgents(ids: string[]) {
  renderAt('/');
  fireEvent.click(screen.getByTestId('connect-card'));
  for (const id of ids) {
    fireEvent.click(screen.getByTestId(`flow-agent-${id}`));
  }
  fireEvent.click(screen.getByTestId('flow-connect'));
  await waitFor(() =>
    expect(screen.getByTestId('screen-FlowAgents')).toBeInTheDocument(),
  );
}

describe('landing and picker', () => {
  it('shows the connect card and the five agents in the picker', () => {
    renderAt('/');
    expect(screen.getByTestId('screen-ConnectLanding')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('connect-card'));
    expect(screen.getByTestId('connect-modal')).toBeInTheDocument();
    for (const id of CONNECTABLE_AGENT_IDS) {
      expect(screen.getByTestId(`flow-agent-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText('procurement.sidb.near')).toBeInTheDocument();
    // Nothing ticked yet: connect stays locked.
    expect(screen.getByTestId('flow-connect')).toBeDisabled();
  });

  it('connecting prices unpaid enrollments and shows the agent details', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);

    const state = useStore.getState();
    const enrolled = state.enrollments.filter((e) => e.terminatedAt === undefined);
    expect(enrolled).toHaveLength(2);
    for (const e of enrolled) {
      expect(e.effectiveAt).toBe(0); // priced, not yet paid
    }
    expect(screen.getByTestId('flow-agent-row-procurement-bot')).toBeInTheDocument();
    expect(screen.getByTestId('flow-agent-row-legacy-bot')).toHaveTextContent(
      FLOW_COPY.agentsNoAttestation,
    );
  });
});

describe('quote', () => {
  it('totals are the plain sums and legacy carries the exclusion chip', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);
    fireEvent.click(screen.getByTestId('flow-agents-continue'));

    expect(screen.getByTestId('screen-FlowQuote')).toBeInTheDocument();
    // $50,000 cap each; premiums $300 (0.6%) + $600 (1.2%).
    expect(screen.getByTestId('quote-total-cover')).toHaveTextContent('$100,000');
    expect(screen.getByTestId('quote-total-premium')).toHaveTextContent('$900');
    expect(screen.getByTestId('quote-row-legacy-bot')).toHaveTextContent(
      FLOW_COPY.quoteBExcluded,
    );
  });
});

describe('payment, disclosures, and signing', () => {
  it('walks pay upfront through A to F and signing activates cover', async () => {
    await connectAgents(['procurement-bot', 'payables-bot']);
    fireEvent.click(screen.getByTestId('flow-agents-continue'));
    fireEvent.click(screen.getByTestId('flow-quote-accept'));

    expect(screen.getByTestId('screen-FlowPay')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pay-upfront'));

    for (const route of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await waitFor(() =>
        expect(screen.getByTestId(`terms-page-${route}`)).toBeInTheDocument(),
      );
      // Agreement is gated on the per-page acknowledgment.
      expect(screen.getByTestId('terms-agree')).toBeDisabled();
      fireEvent.click(screen.getByTestId('terms-acknowledge'));
      fireEvent.click(screen.getByTestId('terms-agree'));
    }

    await waitFor(() =>
      expect(screen.getByTestId('screen-FlowSign')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('sign-statement')).toHaveTextContent(
      FLOW_COPY.signStatement,
    );
    expect(screen.getByTestId('sign-exclusions')).toBeInTheDocument();

    // Signing is gated on the final acknowledgment.
    expect(screen.getByTestId('flow-sign')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sign-acknowledge'));
    fireEvent.click(screen.getByTestId('flow-sign'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-Policies')).toBeInTheDocument(),
    );

    const state = useStore.getState();
    for (const id of ['procurement-bot', 'payables-bot']) {
      const enrollment = state.enrollments.find((e) => e.agentId === id);
      expect(enrollment).toBeDefined();
      expect(enrollment!.effectiveAt).toBeGreaterThan(0);
      expect(state.agents.find((a) => a.id === id)?.status).toBe('Active');
    }
  });

  it('pay with stake records the choice and reaches the disclosures', async () => {
    await connectAgents(['treasury-bot']);
    fireEvent.click(screen.getByTestId('flow-agents-continue'));
    fireEvent.click(screen.getByTestId('flow-quote-accept'));
    fireEvent.click(screen.getByTestId('pay-stake'));
    await waitFor(() =>
      expect(screen.getByTestId('terms-page-A')).toBeInTheDocument(),
    );
  });
});

describe('flow guards', () => {
  it('deep links without a connection restart at the landing card', async () => {
    renderAt('/flow/terms/4');
    await waitFor(() =>
      expect(screen.getByTestId('screen-ConnectLanding')).toBeInTheDocument(),
    );
  });
});

describe('copy rules', () => {
  it('flow copy contains no colons, semicolons, or dashes', () => {
    const forbidden = /[:;‐‑‒–—-]/;
    const strings: string[] = [
      FLOW_COPY.landingSub,
      FLOW_COPY.connectCard,
      FLOW_COPY.modalTitle,
      FLOW_COPY.modalSub,
      FLOW_COPY.modalCancel,
      FLOW_COPY.modalConnect(1),
      FLOW_COPY.modalConnect(3),
      FLOW_COPY.modalConnectNone,
      FLOW_COPY.processingTitle,
      ...FLOW_COPY.processingSteps,
      FLOW_COPY.agentsTitle,
      FLOW_COPY.agentsSub,
      FLOW_COPY.agentsContinue,
      ...Object.values(FLOW_COPY.agentsLabels),
      FLOW_COPY.agentsAudited,
      FLOW_COPY.agentsNoAttestation,
      FLOW_COPY.quoteTitle,
      FLOW_COPY.quoteSub,
      FLOW_COPY.quoteTotalCover,
      FLOW_COPY.quoteAnnualPremium,
      FLOW_COPY.quoteAccept,
      FLOW_COPY.quoteBExcluded,
      FLOW_COPY.payTitle,
      FLOW_COPY.paySub,
      FLOW_COPY.payUpfrontTitle,
      FLOW_COPY.payUpfrontBody,
      FLOW_COPY.payStakeTitle,
      FLOW_COPY.payStakeBody,
      FLOW_COPY.payChoose,
      FLOW_COPY.termsProgress(3),
      FLOW_COPY.termsSub,
      FLOW_COPY.termsCovered,
      FLOW_COPY.termsNotCovered,
      FLOW_COPY.termsPayment,
      FLOW_COPY.termsLimit,
      FLOW_COPY.termsAgree,
      FLOW_COPY.signTitle,
      FLOW_COPY.signSub,
      FLOW_COPY.signExclusions,
      FLOW_COPY.signAck,
      FLOW_COPY.signStatement,
      FLOW_COPY.signButton,
      ...FLOW_TERMS.flatMap((t) => [
        t.title,
        t.intro,
        ...t.covered,
        ...t.notCovered,
        t.payment,
        t.acknowledgment,
      ]),
      FLOW_COPY.signTheaterTitle,
      ...FLOW_COPY.signSteps,
      ...Object.values(FLOW_COPY.signLabels),
      ...Object.values(FLOW_COPY.paymentMethodNames),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });
});
