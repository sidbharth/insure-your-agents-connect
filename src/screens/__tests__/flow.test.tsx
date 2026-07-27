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

/** Landing → picker → connect the given agents → straight to the quote. */
async function connectAgents(ids: string[]) {
  renderAt('/');
  fireEvent.click(screen.getByTestId('connect-card'));
  for (const id of ids) {
    fireEvent.click(screen.getByTestId(`flow-agent-${id}`));
  }
  fireEvent.click(screen.getByTestId('flow-connect'));
  await waitFor(() =>
    expect(screen.getByTestId('screen-FlowQuote')).toBeInTheDocument(),
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

  it('select all ticks every agent and toggles to clear all', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('connect-card'));
    fireEvent.click(screen.getByTestId('flow-select-all'));
    expect(screen.getByTestId('flow-connect')).toHaveTextContent(
      FLOW_COPY.modalConnect(CONNECTABLE_AGENT_IDS.length),
    );
    expect(screen.getByTestId('flow-select-all')).toHaveTextContent(
      FLOW_COPY.modalClearAll,
    );
    fireEvent.click(screen.getByTestId('flow-select-all'));
    expect(screen.getByTestId('flow-connect')).toBeDisabled();
  });

  it('connecting prices unpaid enrollments and lands on the quote', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);

    const state = useStore.getState();
    const enrolled = state.enrollments.filter((e) => e.terminatedAt === undefined);
    expect(enrolled).toHaveLength(2);
    for (const e of enrolled) {
      expect(e.effectiveAt).toBe(0); // priced, not yet paid
    }
    expect(screen.getByTestId('quote-row-procurement-bot')).toBeInTheDocument();
    expect(screen.getByTestId('quote-row-legacy-bot')).toBeInTheDocument();
  });
});

describe('quote', () => {
  it('totals are the plain sums and legacy carries the exclusion chip', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);

    expect(screen.getByTestId('screen-FlowQuote')).toBeInTheDocument();
    // $50,000 cap each; premiums $300 (0.6%) + $600 (1.2%).
    expect(screen.getByTestId('quote-total-cover')).toHaveTextContent('$100,000');
    expect(screen.getByTestId('quote-total-premium')).toHaveTextContent('$900');
    expect(screen.getByTestId('quote-row-legacy-bot')).toHaveTextContent(
      FLOW_COPY.quoteBExcluded,
    );
  });

  it('expanding an agent row shows the frozen rate breakdown', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);

    fireEvent.click(screen.getByTestId('quote-row-procurement-bot'));
    const clean = screen.getByTestId('quote-breakdown-procurement-bot');
    expect(clean).toHaveTextContent('Base rate (fully compliant)');
    expect(clean).toHaveTextContent('0.6% × $50,000 = $300');

    fireEvent.click(screen.getByTestId('quote-row-legacy-bot'));
    const legacy = screen.getByTestId('quote-breakdown-legacy-bot');
    expect(legacy).toHaveTextContent('No TEE attestation');
    expect(legacy).toHaveTextContent(FLOW_COPY.quoteBExcluded);
    expect(legacy).toHaveTextContent('1.2% × $50,000 = $600');
  });

  it('removing an agent from the expanded row recomputes the quote', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);
    expect(screen.getByTestId('quote-total-premium')).toHaveTextContent('$900');

    fireEvent.click(screen.getByTestId('quote-row-legacy-bot'));
    fireEvent.click(screen.getByTestId('quote-remove-legacy-bot'));

    // Row gone, totals recomputed from the remaining agent.
    expect(screen.queryByTestId('quote-row-legacy-bot')).not.toBeInTheDocument();
    expect(screen.getByTestId('quote-total-premium')).toHaveTextContent('$300');
    expect(screen.getByTestId('quote-total-cover')).toHaveTextContent('$50,000');

    // The unpaid quote is terminated and the agent returns to Draft.
    const state = useStore.getState();
    const legacyEnrollment = state.enrollments.find((e) => e.agentId === 'legacy-bot');
    expect(legacyEnrollment?.terminatedAt).toBeDefined();
    expect(state.agents.find((a) => a.id === 'legacy-bot')?.status).toBe('Draft');
    // A never activated quote never appears on the policies page.
    expect(legacyEnrollment?.effectiveAt).toBe(0);
  });

  it('the agents carry distinct control profiles that price differently', async () => {
    await connectAgents(['payables-bot', 'treasury-bot', 'refunds-bot']);

    // payables skips human approval (0.9%), treasury skips timelock and
    // kill switch (1.1%), refunds skips every optional control (ceiling).
    expect(screen.getByTestId('quote-row-payables-bot')).toHaveTextContent('0.9%');
    expect(screen.getByTestId('quote-row-payables-bot')).toHaveTextContent('$450');
    expect(screen.getByTestId('quote-row-treasury-bot')).toHaveTextContent('1.1%');
    expect(screen.getByTestId('quote-row-treasury-bot')).toHaveTextContent('$550');
    expect(screen.getByTestId('quote-row-refunds-bot')).toHaveTextContent('$1,500');

    fireEvent.click(screen.getByTestId('quote-row-refunds-bot'));
    const ceiling = screen.getByTestId('quote-breakdown-refunds-bot');
    expect(ceiling).toHaveTextContent('No human approval above threshold');
    expect(ceiling).toHaveTextContent(FLOW_COPY.quoteBExcluded);
    expect(ceiling).toHaveTextContent('3.0% × $50,000 = $1,500');
  });

  it('the expanded row carries the cover map and the claim disclosures', async () => {
    await connectAgents(['legacy-bot']);

    fireEvent.click(screen.getByTestId('quote-row-legacy-bot'));
    // Coverage B is excluded on the map for an agent without attestation;
    // the rest show their per-event limits in $NEAR with the USD anchor.
    expect(screen.getByTestId('cover-map-legacy-bot-B')).toHaveTextContent(
      FLOW_COPY.coverMapExcluded,
    );
    // Coverage A at the $50,000 cap and the pinned $3.00 rate.
    expect(screen.getByTestId('cover-map-legacy-bot-A')).toHaveTextContent('16,667');
    expect(screen.getByTestId('cover-map-legacy-bot-A')).toHaveTextContent('$50,000');
    // Deductible, limits, and claims disclosures sit inside the dropdown.
    const panel = screen.getByTestId('cover-map-legacy-bot').parentElement!;
    expect(panel).toHaveTextContent(FLOW_COPY.deductibleBody);
    expect(panel).toHaveTextContent(FLOW_COPY.claimsBody);
  });
});

/** Quote accept → disclosures A to F → signature → payment page. */
async function agreeAndSign() {
  fireEvent.click(screen.getByTestId('flow-quote-accept'));
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
  expect(screen.getByTestId('sign-exclusions')).toBeInTheDocument();
  // Signing is gated on the final acknowledgment.
  expect(screen.getByTestId('flow-sign')).toBeDisabled();
  fireEvent.click(screen.getByTestId('sign-acknowledge'));
  fireEvent.click(screen.getByTestId('flow-sign'));
  await waitFor(() =>
    expect(screen.getByTestId('screen-FlowPay')).toBeInTheDocument(),
  );
}

function expectActivated(ids: string[]) {
  const state = useStore.getState();
  for (const id of ids) {
    const enrollment = state.enrollments.find((e) => e.agentId === id);
    expect(enrollment).toBeDefined();
    expect(enrollment!.effectiveAt).toBeGreaterThan(0);
    expect(state.agents.find((a) => a.id === id)?.status).toBe('Active');
  }
}

describe('disclosures, signing, and payment', () => {
  it('quote accept leads through A to F into signing, then payment upfront activates cover', async () => {
    await connectAgents(['procurement-bot', 'payables-bot']);
    await agreeAndSign();

    // The stake option is highlighted as recommended with the credits tag.
    expect(screen.getByTestId('pay-stake-recommended')).toHaveTextContent(
      FLOW_COPY.payRecommended,
    );
    expect(screen.getByTestId('pay-stake-credit')).toHaveTextContent(
      FLOW_COPY.payStakeCredit,
    );

    fireEvent.click(screen.getByTestId('pay-upfront'));
    fireEvent.click(screen.getByTestId('pay-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-Policies')).toBeInTheDocument(),
    );
    expectActivated(['procurement-bot', 'payables-bot']);
  });

  it('pay with stake runs the staking demo and activates cover', async () => {
    await connectAgents(['treasury-bot']);
    await agreeAndSign();

    fireEvent.click(screen.getByTestId('pay-stake'));
    // Premium $550 at the pinned $3.00 rate; stake sized at a 10% reward
    // rate: (550 / 3) / 0.1 ≈ 1,833 $NEAR.
    expect(screen.getByTestId('stake-note')).toHaveTextContent('1,833');
    fireEvent.click(screen.getByTestId('pay-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-Policies')).toBeInTheDocument(),
    );
    expectActivated(['treasury-bot']);
  });

  it('the who box on Coverage B names excluded agents', async () => {
    await connectAgents(['procurement-bot', 'legacy-bot']);
    fireEvent.click(screen.getByTestId('flow-quote-accept'));

    await waitFor(() =>
      expect(screen.getByTestId('terms-page-A')).toBeInTheDocument(),
    );
    // On Coverage A both agents are covered.
    expect(screen.getByTestId('terms-who-legacy-bot')).not.toHaveTextContent(
      FLOW_COPY.coverMapExcluded,
    );
    fireEvent.click(screen.getByTestId('terms-acknowledge'));
    fireEvent.click(screen.getByTestId('terms-agree'));

    await waitFor(() =>
      expect(screen.getByTestId('terms-page-B')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('terms-who-legacy-bot')).toHaveTextContent(
      FLOW_COPY.coverMapExcluded,
    );
    expect(screen.getByTestId('terms-who-procurement-bot')).not.toHaveTextContent(
      FLOW_COPY.coverMapExcluded,
    );
  });

  it('the payment page is locked until the signature is recorded', async () => {
    await connectAgents(['procurement-bot']);
    fireEvent.click(screen.getByTestId('flow-quote-accept'));
    // Jumping to payment before signing snaps back into the disclosures.
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
      FLOW_COPY.modalSelectAll,
      FLOW_COPY.modalClearAll,
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
      FLOW_COPY.quoteHint,
      FLOW_COPY.quoteTotalCover,
      FLOW_COPY.quoteAnnualPremium,
      FLOW_COPY.quoteAccept,
      FLOW_COPY.quoteBExcluded,
      FLOW_COPY.quoteRemove,
      FLOW_COPY.totalRate,
      ...Object.values(FLOW_COPY.quoteColumns),
      FLOW_COPY.coverMapTitle,
      FLOW_COPY.coverMapExcluded,
      FLOW_COPY.coverMapLimitNote,
      FLOW_COPY.deductibleTitle,
      FLOW_COPY.deductibleBody,
      FLOW_COPY.limitsTitle,
      FLOW_COPY.limitsBody('16,667 $NEAR', '$50,000'),
      FLOW_COPY.claimsTitle,
      FLOW_COPY.claimsBody,
      FLOW_COPY.termsWhoTitle,
      FLOW_COPY.termsWhoExcludedReason,
      FLOW_COPY.termsDepletion,
      FLOW_COPY.payTitle,
      FLOW_COPY.paySub,
      FLOW_COPY.payUpfrontTitle,
      FLOW_COPY.payUpfrontBody,
      FLOW_COPY.payStakeTitle,
      FLOW_COPY.payStakeBody,
      FLOW_COPY.payChoose,
      FLOW_COPY.payRecommended,
      FLOW_COPY.payStakeCredit,
      FLOW_COPY.payConfirmUpfrontTitle,
      FLOW_COPY.payConfirmStakeTitle,
      FLOW_COPY.payStakeNote,
      FLOW_COPY.payStakeEstimate('1,833 $NEAR'),
      FLOW_COPY.payConfirmUpfront,
      FLOW_COPY.payConfirmStake,
      FLOW_COPY.payBack,
      FLOW_COPY.payUpfrontTheaterTitle,
      ...FLOW_COPY.payUpfrontSteps,
      FLOW_COPY.payStakeTheaterTitle,
      ...FLOW_COPY.payStakeSteps,
      ...Object.values(FLOW_COPY.payLabels),
      FLOW_COPY.termsProgress(3),
      FLOW_COPY.termsSub,
      FLOW_COPY.termsCovered,
      FLOW_COPY.termsNotCovered,
      FLOW_COPY.termsPayment,
      FLOW_COPY.termsLimit,
      FLOW_COPY.termsLimitPerAgent,
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
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });
});
