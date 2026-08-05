/**
 * Connect flow tests — the variant's single purchase flow:
 *  - landing card opens the agent picker with the five .sidb.near agents.
 *  - connecting lands on the coverage walkthrough, which checks each agent's
 *    AgentConnect settings account by account and shows what they earn.
 *  - fixing a gap on the walkthrough raises the amount on the spot.
 *  - the summary merges every coverage and agent into one grid plus the price.
 *  - signing then paying activates cover and lands on the cover dashboard.
 *  - deep links without a connection restart the flow at the landing card.
 *  - flow copy obeys the punctuation rule (no colons, semicolons, dashes).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../App';
import { FLOW_COPY, FLOW_TERMS, REVIEW_COPY } from '../../data/copy';
import { setLatencyTestMode } from '../../lib/latency';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { resetSetups } from '../flow/accounts';
import { agentCoverUsd, evaluateCoverage } from '../flow/coverage';
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
  resetSetups();
});

afterEach(() => {
  cleanup();
  setLatencyTestMode(false);
  setPriceFetchFn(undefined);
});

/** Landing → picker → connect → the walkthrough's first page. */
async function connectAgents(ids: string[]) {
  renderAt('/');
  fireEvent.click(screen.getByTestId('connect-card'));
  for (const id of ids) {
    fireEvent.click(screen.getByTestId(`flow-agent-${id}`));
  }
  fireEvent.click(screen.getByTestId('flow-connect'));
  await waitFor(() =>
    expect(screen.getByTestId('screen-FlowReview')).toBeInTheDocument(),
  );
}

/** Agree through all five coverage pages to the summary. */
async function walkCoverages() {
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    await waitFor(() =>
      expect(screen.getByTestId(`review-page-${letter}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId('review-agree')).toBeDisabled();
    fireEvent.click(screen.getByTestId('review-acknowledge'));
    fireEvent.click(screen.getByTestId('review-agree'));
  }
  await waitFor(() =>
    expect(screen.getByTestId('screen-FlowSummary')).toBeInTheDocument(),
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
    expect(screen.getByTestId('flow-connect')).toBeDisabled();
  });

  it('select all ticks every agent and toggles to clear all', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('connect-card'));
    fireEvent.click(screen.getByTestId('flow-select-all'));
    expect(screen.getByTestId('flow-connect')).toHaveTextContent(
      FLOW_COPY.modalConnect(CONNECTABLE_AGENT_IDS.length),
    );
    fireEvent.click(screen.getByTestId('flow-select-all'));
    expect(screen.getByTestId('flow-connect')).toBeDisabled();
  });
});

describe('coverage walkthrough', () => {
  it('shows what each agent earns from its own settings', async () => {
    await connectAgents(['procurement-bot', 'refunds-bot']);

    // Coverage A: procurement has a payee list plus approval on both
    // accounts, refunds has neither.
    const clean = screen.getByTestId('review-agent-procurement-bot');
    expect(clean).toHaveTextContent(REVIEW_COPY.fullNote);
    expect(screen.getByTestId('review-amount-procurement-bot')).toHaveTextContent(
      '16,667',
    );
    expect(screen.getByTestId('review-agent-refunds-bot')).toHaveTextContent(
      REVIEW_COPY.noneNote,
    );
  });

  it('fixing a gap raises the amount on the spot', async () => {
    await connectAgents(['refunds-bot']);

    const before = evaluateCoverage('refunds-bot', 'A').coverUsd;
    expect(before).toBe(0);

    // Fix every open check on this page for the one agent.
    const agentCard = screen.getByTestId('review-agent-refunds-bot');
    let fixes = within(agentCard).queryAllByTestId('review-fix');
    while (fixes.length > 0) {
      fireEvent.click(fixes[0]);
      fixes = within(
        screen.getByTestId('review-agent-refunds-bot'),
      ).queryAllByTestId('review-fix');
    }

    expect(evaluateCoverage('refunds-bot', 'A').coverUsd).toBe(50_000);
    expect(screen.getByTestId('review-amount-refunds-bot')).toHaveTextContent('16,667');
  });

  it('a partly configured agent earns the matching share', async () => {
    await connectAgents(['treasury-bot']);
    // Coverage A: checking and operations qualify, tax does not (2 of 3).
    const evaluation = evaluateCoverage('treasury-bot', 'A');
    expect(evaluation.qualifyingCount).toBe(2);
    expect(evaluation.totalCount).toBe(3);
    expect(evaluation.coverUsd).toBe(33_000);
    expect(screen.getByTestId('review-agent-treasury-bot')).toHaveTextContent(
      REVIEW_COPY.partialNote(2, 3),
    );
  });

  it('an agent gate closes the whole coverage', async () => {
    await connectAgents(['legacy-bot']);
    // legacy has no tamper proof logging, so Coverage B pays nothing even
    // though its one account is otherwise set up.
    expect(evaluateCoverage('legacy-bot', 'B').coverUsd).toBe(0);
    // And no recovery key, so Coverage C pays nothing either.
    expect(evaluateCoverage('legacy-bot', 'C').coverUsd).toBe(0);
  });
});

describe('summary, signing, and payment', () => {
  it('merges every coverage into one grid and prices the gaps', async () => {
    await connectAgents(['procurement-bot']);
    await walkCoverages();

    // procurement earns the full amount on every coverage; E is the slice.
    expect(screen.getByTestId('summary-procurement-bot-A')).toHaveTextContent('$50,000');
    expect(screen.getByTestId('summary-procurement-bot-E')).toHaveTextContent('$7,500');
    // No gaps left, so the base rate applies to the agent's amount.
    expect(screen.getByTestId('summary-gaps')).toHaveTextContent(REVIEW_COPY.summaryClean);
    expect(screen.getByTestId('summary-price')).toHaveTextContent('$300');
  });

  it('a weaker setup shows open gaps and a higher price', async () => {
    await connectAgents(['legacy-bot']);
    await walkCoverages();
    expect(screen.getByTestId('summary-gaps')).toHaveTextContent('gaps are still open');
  });

  it('accepting leads through signing and payment to active cover', async () => {
    await connectAgents(['procurement-bot']);
    await walkCoverages();

    fireEvent.click(screen.getByTestId('summary-accept'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-FlowSign')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('flow-sign')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sign-acknowledge'));
    fireEvent.click(screen.getByTestId('flow-sign'));

    await waitFor(() =>
      expect(screen.getByTestId('screen-FlowPay')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('pay-credit-tag')).toHaveTextContent(FLOW_COPY.payCreditTag);
    fireEvent.click(screen.getByTestId('pay-upfront'));
    // $300 yearly price earns 25% back as NEAR AI credits.
    expect(screen.getByTestId('pay-credit-earn')).toHaveTextContent('$75');
    fireEvent.click(screen.getByTestId('pay-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('screen-Policies')).toBeInTheDocument(),
    );
    const state = useStore.getState();
    const enrollment = state.enrollments.find((e) => e.agentId === 'procurement-bot');
    expect(enrollment?.effectiveAt).toBeGreaterThan(0);
    expect(state.agents.find((a) => a.id === 'procurement-bot')?.status).toBe('Active');
  });
});

describe('flow guards', () => {
  it('deep links without a connection restart at the landing card', async () => {
    renderAt('/flow/review/3');
    await waitFor(() =>
      expect(screen.getByTestId('screen-ConnectLanding')).toBeInTheDocument(),
    );
  });

  it('the summary is locked until every coverage is agreed', async () => {
    await connectAgents(['procurement-bot']);
    renderAt('/flow/summary');
    await waitFor(() =>
      expect(screen.getAllByTestId('screen-FlowReview').length).toBeGreaterThan(0),
    );
  });
});

describe('cover amounts', () => {
  it('an agent headline is the largest amount it earns', () => {
    expect(agentCoverUsd('procurement-bot')).toBe(50_000);
    expect(agentCoverUsd('legacy-bot')).toBe(50_000); // Coverage A only
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
      FLOW_COPY.termsCovered,
      FLOW_COPY.termsNotCovered,
      FLOW_COPY.termsPayment,
      FLOW_COPY.termsAgree,
      FLOW_COPY.signTitle,
      FLOW_COPY.signSub,
      FLOW_COPY.signExclusions,
      FLOW_COPY.signAck,
      FLOW_COPY.signStatement,
      FLOW_COPY.signButton,
      FLOW_COPY.signTheaterTitle,
      ...FLOW_COPY.signSteps,
      ...Object.values(FLOW_COPY.signLabels),
      FLOW_COPY.payTitle,
      FLOW_COPY.paySub,
      FLOW_COPY.payUpfrontTitle,
      FLOW_COPY.payUpfrontBody,
      FLOW_COPY.payChoose,
      FLOW_COPY.payCreditTag,
      FLOW_COPY.payCreditBody,
      FLOW_COPY.payCreditEarn('$175'),
      FLOW_COPY.payConfirmUpfrontTitle,
      FLOW_COPY.payConfirmUpfront,
      FLOW_COPY.payBack,
      FLOW_COPY.payUpfrontTheaterTitle,
      ...FLOW_COPY.payUpfrontSteps,
      ...Object.values(FLOW_COPY.payLabels),
      ...FLOW_TERMS.flatMap((t) => [
        t.title,
        t.intro,
        ...t.covered,
        ...t.notCovered,
        t.payment,
        t.acknowledgment,
      ]),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });

  it('review copy contains no colons, semicolons, or dashes', () => {
    const forbidden = /[:;‐‑‒–—-]/;
    const strings: string[] = [
      REVIEW_COPY.progress(2),
      REVIEW_COPY.sub,
      REVIEW_COPY.yourSetup,
      REVIEW_COPY.earns,
      REVIEW_COPY.fullNote,
      REVIEW_COPY.partialNote(2, 3),
      REVIEW_COPY.noneNote,
      REVIEW_COPY.fixTitle,
      REVIEW_COPY.fixNow,
      REVIEW_COPY.fixed,
      REVIEW_COPY.accountCovered,
      REVIEW_COPY.accountNotCovered,
      REVIEW_COPY.agree,
      REVIEW_COPY.back,
      REVIEW_COPY.summaryTitle,
      REVIEW_COPY.summarySub('procurement.sidb.near'),
      REVIEW_COPY.summaryCoverage,
      REVIEW_COPY.summaryAgent,
      REVIEW_COPY.summaryTotal,
      REVIEW_COPY.summaryAccept,
      REVIEW_COPY.summaryGaps(1),
      REVIEW_COPY.summaryGaps(3),
      REVIEW_COPY.summaryClean,
    ];
    for (const s of strings) {
      expect(s).not.toMatch(forbidden);
    }
  });
});
