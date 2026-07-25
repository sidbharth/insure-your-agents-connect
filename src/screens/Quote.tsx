/**
 * Screen 7.6 — Your quote (WP-3; mockups wizard-quote-compliant.html /
 * wizard-quote-attestation-off.html).
 *
 * Three stacked panels: (1) the price — ladder recap with separate loading
 * lines, annual premium in $ and N at the live rate with source/timestamp,
 * quarterly option, worked math expandable under "Show the math"; (2) six
 * display-only coverage cards (REQ-7.6.1) — Coverage B greys with its reason
 * when attestation is off; (3) the non-collapsible exclusion wall
 * (REQ-7.6.2) + limits picture + retention preview. "Test a scenario" opens
 * the Scenario Explorer pre-purchase (REQ-7.6.3). The advanced expander's
 * payment-rail / research-floor items are STATIC copy, never computed
 * (plan §4).
 */
import { Link, useNavigate } from 'react-router-dom';
import { CoverageCards, type CoverageCardState } from '../components/CoverageCards';
import { LADDER_CEILING_PCT } from '../components/RateLadder';
import { ExclusionWall } from '../components/ExclusionWall';
import { PriceChipInline } from '../components/helpers';
import { MathValue } from '../components/MathValue';
import { RetentionPreview } from '../components/RetentionPreview';
import {
  ADVANCED_PRICING_COPY,
  COVERAGE_B_GREY_REASON,
  COVERAGE_PANEL_TOOLTIP,
  QUARTERLY_NOTE,
  TIER1_DECLINE_COPY,
} from '../data/copy';
import { WIZARD_AGENT } from '../data/seed';
import { loadingApplies } from '../lib/concentration';
import {
  formatN,
  formatPct,
  formatUsd,
  usdToN,
  type MathBreakdown,
} from '../lib/money';
import { priceAgent } from '../lib/pricing';
import { useStore } from '../store';
import type { RateLine } from '../store/types';
import {
  capUsdFor,
  componentKey,
  hasConcentrationLoading,
  latestMandate,
  pricingInputFor,
} from './purchase/enroll';
import { getWizardAgentId } from './wizard/wizardAgent';
import { WizardBack, WizardStepper } from './wizard/Stepper';

/** Horizontal ladder recap bar (quote mockup): slices to the 3.0% ceiling. */
function LadderRecap({ ladder }: { ladder: RateLine[] }) {
  return (
    <div data-testid="ladder-recap">
      <div className="relative flex h-[26px] overflow-hidden rounded-md border border-line-soft bg-[#edf0ee]">
        {ladder.map((line, i) => (
          <div
            key={line.label}
            data-testid="recap-slice"
            title={`${line.label}: ${formatPct(line.points, { signed: i > 0 })}`}
            className={`num flex h-full items-center justify-center text-[10.5px] font-bold ${i === 0 ? 'text-[#0b3b28]' : 'text-white'}`}
            style={{
              width: `${(line.points / LADDER_CEILING_PCT) * 100}%`,
              background: i === 0 ? '#00EC97' : ['#d98a1f', '#c07314', '#a75f0d', '#8a4e08'][Math.min(i - 1, 3)],
            }}
          >
            {formatPct(line.points, { signed: i > 0 })}
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-faint">
        <span>0%</span>
        <span className="font-bold text-bad">3.0% ceiling</span>
      </div>
    </div>
  );
}

export default function Quote() {
  const navigate = useNavigate();
  const agents = useStore((s) => s.agents);
  const priceFeed = useStore((s) => s.priceFeed);
  const state = useStore();

  const wizardId = getWizardAgentId();
  const agent =
    agents.find((a) => a.id === wizardId && a.status !== 'De-enrolled') ??
    agents.find((a) => a.id === WIZARD_AGENT.id && a.status !== 'De-enrolled') ??
    agents[0];
  const mandate = latestMandate(state, agent.id);
  const capUsd = capUsdFor(state, agent.id);

  // Concentration preview: frozen on the enrollment if one exists, otherwise
  // the atomic prospective-book decision (plan §4b).
  const enrollment = state.enrollments.find(
    (e) => e.agentId === agent.id && e.terminatedAt === undefined,
  );
  const concentrationLoading = enrollment
    ? hasConcentrationLoading(enrollment)
    : loadingApplies(state.book, componentKey(agent), capUsd);

  const priced = priceAgent(pricingInputFor(state, agent, mandate, concentrationLoading));

  if (priced.kind === 'declined') {
    return (
      <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Quote">
        <h1 className="text-lg">Your quote</h1>
        <div
          className="mt-4 rounded-card border border-bad-line bg-bad-bg p-6 shadow-card"
          data-testid="quote-declined"
        >
          <div className="text-lg font-bold text-bad">DECLINED</div>
          <p className="mt-2 text-sm text-bad">
            {TIER1_DECLINE_COPY(priced.missingGates[0])}
          </p>
        </div>
      </div>
    );
  }

  const usdPerN = priceFeed.usdPerN;
  const premiumUsd = priced.premiumUsd;
  const premiumNVal = usdToN(premiumUsd, usdPerN);
  const ladderLines = priced.breakdown.filter((l) => l.group === 'ladder');
  const loadingLines = priced.breakdown.filter((l) => l.group === 'loading');

  const premiumBreakdown: MathBreakdown = {
    title: 'Annual premium',
    inputs: [
      { label: 'Rate (ladder + loadings)', amount: formatPct(priced.totalRatePct), clause: 'Appendix 3' },
      { label: 'Per-transaction cap', amount: formatUsd(capUsd) },
      { label: '$NEAR reference price', amount: `1 $NEAR = $${usdPerN.toFixed(2)}` },
    ],
    formula: `${formatPct(priced.totalRatePct)} × ${formatUsd(capUsd)} = ${formatUsd(premiumUsd)} per year. ${formatUsd(premiumUsd)} ÷ $${usdPerN.toFixed(2)} = ${formatN(premiumNVal, { maxFractionDigits: 0 })}.`,
    clause: 'Appendix 3, T5.1',
    resultUsd: premiumUsd,
    rateUsed: usdPerN,
  };

  const coverageStates: CoverageCardState[] = (['A', 'B', 'C', 'D', 'E', 'F'] as const).map(
    (route) => ({
      route,
      active: route !== 'B' || !priced.flags.coverageBExcluded,
      greyReason:
        route === 'B' && priced.flags.coverageBExcluded ? COVERAGE_B_GREY_REASON : undefined,
    }),
  );

  const limits = [
    { label: 'Coverages A–D', pct: 100, usd: capUsd },
    { label: 'Coverage E', pct: 50, usd: capUsd * 0.5 },
    { label: 'Coverage F', pct: 15, usd: capUsd * 0.15 },
  ];

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-Quote">
      <WizardStepper current="quote" className="mb-3" />
      <WizardBack
        to="/controls"
        note="Going back keeps your mandate and controls. The quote re-derives from them."
        className="mb-5"
      />
      <h1 className="mb-5 text-lg">Your quote</h1>

      {/* ------------------------------------------------ 1 · the price */}
      <section className="rounded-card border border-line bg-panel shadow-card" data-testid="quote-price-panel">
        <div className="border-b border-line-soft px-6 py-3.5">
          <h2 className="text-md">The price</h2>
        </div>
        <div className="px-6 py-5">
          <LadderRecap ladder={ladderLines} />

          {loadingLines.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-line-soft pt-2" data-testid="quote-loading-lines">
              <div className="text-2xs font-bold uppercase tracking-wider text-faint">
                Loadings
              </div>
              {loadingLines.map((line) => (

                <div key={line.label} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 flex-none rounded-sm border border-warn-line bg-warn-bg" />
                  <span className="flex-1 text-muted">{line.label}</span>
                  <b className="num text-warn">{formatPct(line.points, { signed: true })}</b>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 divide-y divide-line-soft rounded-lg border border-line bg-canvas sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <div className="text-2xs font-bold uppercase tracking-widest text-faint">Rate</div>
              <div className="num mt-1 text-xl font-bold text-ink" data-testid="quote-rate">
                {formatPct(priced.totalRatePct)}
              </div>
              <div className="mt-0.5 text-2xs text-muted">of the {formatUsd(capUsd)} cap</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                Annual premium
              </div>
              <div className="num mt-1 text-xl font-bold text-ink" data-testid="quote-premium">
                <MathValue breakdown={premiumBreakdown}>
                  {formatUsd(premiumUsd)}{' '}
                  <span className="text-md font-semibold text-muted">
                    ≈ {formatN(premiumNVal, { maxFractionDigits: 0 })}
                  </span>
                </MathValue>
              </div>
              <div className="num mt-0.5 text-2xs text-muted" data-testid="quote-price-source">
                at <PriceChipInline /> via {priceFeed.source}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                Quarterly option
              </div>
              <div className="num mt-1 text-md font-semibold text-ink" data-testid="quote-quarterly">
                4 × {formatUsd(premiumUsd / 4)} ≈ {formatN(premiumNVal / 4, { maxFractionDigits: 1 })}
              </div>
              <div className="mt-0.5 text-2xs text-muted">{QUARTERLY_NOTE}</div>
            </div>
          </div>

          {/* Advanced disclosure — STATIC copy, never computed (plan §4). */}
          <details className="mt-5 rounded-md border border-line bg-[#f6f8f7]" data-testid="quote-advanced">
            <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-ink-2">
              Advanced pricing disclosure
            </summary>
            <ul className="space-y-1.5 border-t border-line-soft px-4 py-3 text-xs text-muted">
              {ADVANCED_PRICING_COPY.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      {/* --------------------------------------- 2 · coverage cards A–F */}
      <section
        className="mt-5 rounded-card border border-line bg-panel shadow-card"
        data-testid="quote-coverage-panel"
      >
        <div className="border-b border-line-soft px-6 py-3.5">
          <h2 className="text-md" title={COVERAGE_PANEL_TOOLTIP}>Coverage</h2>
        </div>
        <div className="px-6 py-5">
          <CoverageCards states={coverageStates} />
        </div>
      </section>

      {/* ----------------------------------------- 3 · exclusion wall */}
      <ExclusionWall className="mt-5" />

      {/* limits picture + retention preview */}
      <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-card border border-line bg-panel shadow-card" data-testid="quote-limits">
          <div className="border-b border-line-soft px-6 py-3.5">
            <h2 className="text-md">Per-event limits</h2>
          </div>
          <div className="px-6 py-4">
            {limits.map(({ label, pct, usd }) => (
              <div
                key={label}
                className="flex items-center gap-3 border-b border-line-soft py-2 text-xs last:border-b-0"
              >
                <span className="w-[130px] text-muted">{label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf0ee]">
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${pct}%`, opacity: pct === 100 ? 1 : pct === 50 ? 0.7 : 0.45 }}
                  />
                </span>
                <b className="num w-[170px] text-right text-ink">
                  {pct}% of cap ({formatUsd(usd)})
                </b>
              </div>
            ))}
            <p className="mt-2.5 text-2xs text-muted">
              Sublimits apply within the per-event limit. Recovery and bounty
              costs are capped at 10% within Coverage F. One aggregate limit
              applies, and a single incident that touches several coverages pays
              once.
            </p>
          </div>
        </div>
        <div>
          <RetentionPreview />
          <div className="mt-3 flex items-center gap-3">
            <Link
              to="/coverage"
              data-testid="test-scenario-link"
              className="rounded-md border border-line bg-panel px-3.5 py-2 text-xs font-semibold text-ink-2 shadow-card"
            >
              Test a scenario
            </Link>
            <button
              className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-ink"
              data-testid="quote-continue"
              onClick={() => navigate('/fleet')}
            >
              Continue to fleet
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
