/**
 * WP-3 — Screen 7.6 "Your quote" (REQ-7.6.1/2/3, plan §7).
 * Price panel (ladder recap, $ + N premium at the live rate, quarterly),
 * STATIC advanced disclosure, coverage cards (B greys with attestation off),
 * non-collapsible exclusion wall, limits picture, retention preview with the
 * two worked examples at the displayed price, scenario link, declined branch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Quote from '../Quote';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { WIZARD_AGENT } from '../../data/seed';
import { ADVANCED_PRICING_COPY, COVERAGE_B_GREY_REASON } from '../../data/copy';

function renderQuote() {
  return render(
    <MemoryRouter initialEntries={['/quote']}>
      <Quote />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  setPriceFetchFn(undefined);
});

describe('7.6 — the price', () => {
  it('shows 0.6% rate and $300 ≈ 100 N for the compliant wizard agent', () => {
    renderQuote();
    expect(screen.getByTestId('quote-rate')).toHaveTextContent('0.6%');
    const premium = screen.getByTestId('quote-premium');
    expect(premium).toHaveTextContent('$300');
    expect(premium).toHaveTextContent('≈ 100 $NEAR');
    // live source line at the reference price
    expect(screen.getByTestId('quote-price-source')).toHaveTextContent('$3.00');
  });

  it('offers the quarterly option with the >15-days-overdue note', () => {
    renderQuote();
    const quarterly = screen.getByTestId('quote-quarterly');
    expect(quarterly).toHaveTextContent('4 × $75');
    expect(screen.getByText(/suspended if an installment is more than 15 days overdue/i)).toBeInTheDocument();
  });

  it('renders the ladder recap with the 3.0% ceiling label', () => {
    renderQuote();
    expect(screen.getByTestId('ladder-recap')).toBeInTheDocument();
    expect(screen.getAllByText(/3\.0% ceiling/).length).toBeGreaterThan(0);
  });

  it('the advanced disclosure is STATIC copy — both schedule items, never computed', () => {
    renderQuote();
    const advanced = screen.getByTestId('quote-advanced');
    for (const item of ADVANCED_PRICING_COPY) {
      expect(advanced).toHaveTextContent(item.slice(0, 60));
      expect(item).toMatch(/to this quote\.$/);
    }
  });
});

describe('7.6 — coverage cards (REQ-7.6.1)', () => {
  it('all six cards are active for the fully compliant agent', () => {
    renderQuote();
    for (const route of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(screen.getByTestId(`coverage-card-${route}`)).toHaveAttribute(
        'data-active',
        'true',
      );
    }
  });

  it('Coverage B greys with its reason when attestation is off; rate becomes 1.2%', () => {
    useStore.getState().setTier2(WIZARD_AGENT.id, 'attestation', false);
    renderQuote();
    const cardB = screen.getByTestId('coverage-card-B');
    expect(cardB).toHaveAttribute('data-active', 'false');
    expect(within(cardB).getByTestId('grey-reason')).toHaveTextContent(
      COVERAGE_B_GREY_REASON,
    );
    expect(screen.getByTestId('quote-rate')).toHaveTextContent('1.2%');
    expect(screen.getByTestId('quote-premium')).toHaveTextContent('$600');
  });
});

describe('7.6 — exclusion wall, limits, retention, scenario link', () => {
  it('the exclusion wall renders unprompted (REQ-7.6.2)', () => {
    renderQuote();
    expect(screen.getByTestId('exclusion-wall')).toBeInTheDocument();
  });

  it('limits picture: A–D 100%, E 50%, F 15% of the $50,000 cap', () => {
    renderQuote();
    const limits = screen.getByTestId('quote-limits');
    expect(limits).toHaveTextContent('100% of cap ($50,000)');
    expect(limits).toHaveTextContent('50% of cap ($25,000)');
    expect(limits).toHaveTextContent('15% of cap ($7,500)');
    expect(limits).toHaveTextContent(/pays once/);
  });

  it('retention preview: $30k → $1,500 (500 N floor), $200k → $4,000 (2%), not collected today', () => {
    renderQuote();
    const retention = screen.getByTestId('retention-preview');
    expect(retention).toHaveTextContent(/not collected today/i);
    expect(retention).toHaveTextContent('$30,000 loss → you bear $1,500');
    expect(retention).toHaveTextContent('$200,000 loss → you bear $4,000');
  });

  it('"Test a scenario" links to the Scenario Explorer (REQ-7.6.3)', () => {
    renderQuote();
    expect(screen.getByTestId('test-scenario-link')).toHaveAttribute('href', '/coverage');
  });
});

describe('7.6 — declined branch (GT-1)', () => {
  it('a tier-1 gate off shows DECLINED naming the gate, never a price', () => {
    useStore.getState().setTier1(WIZARD_AGENT.id, 'transferCaps', false);
    renderQuote();
    const declined = screen.getByTestId('quote-declined');
    expect(declined).toHaveTextContent('DECLINED');
    expect(declined).toHaveTextContent(/transfer caps/);
    expect(declined).toHaveTextContent(/declines any agent without transfer caps/);
    expect(screen.queryByTestId('quote-rate')).not.toBeInTheDocument();
  });
});
