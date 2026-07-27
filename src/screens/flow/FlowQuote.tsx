/**
 * Connect flow, step 2 — the overall quote (route /flow/quote), denominated
 * in $NEAR at the live rate with USD anchors underneath.
 *
 * Each agent row expands into the full picture for that agent: how its rate
 * was built, what it is covered for and up to how much per coverage, how the
 * deductible works, how payments deplete the annual cover, and how claims
 * are counted. Agents can be removed from the quote here; the totals
 * recompute from the remaining rows.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriceChipInline } from '../../components/helpers';
import { COVERAGE_CARDS, FLOW_COPY } from '../../data/copy';
import { perEventLimit } from '../../lib/claims';
import { shortHash } from '../../lib/hash';
import { formatN, formatPct, formatUsd, usdToN } from '../../lib/money';
import { useStore } from '../../store';
import type { Agent, CoverageRoute, RateLine } from '../../store/types';
import {
  capUsdFor,
  controlsSummary,
  coverageBExcluded,
  enrollmentRatePct,
} from '../purchase/enroll';
import { getSelectedAgentIds, setSelectedAgentIds } from './flowState';
import {
  CAP_BASE_USD,
  recommendedCapUsd,
  stackRows,
} from './stack';

/** Display letter → engine route. Counterparty cover is not offered; the
 * response cover displays as Coverage E while pricing on the engine's F
 * limits. */
const COVER_MAP_ROWS: { letter: string; route: CoverageRoute }[] = [
  { letter: 'A', route: 'A' },
  { letter: 'B', route: 'B' },
  { letter: 'C', route: 'C' },
  { letter: 'D', route: 'D' },
  { letter: 'E', route: 'F' },
];

/** Primary $NEAR figure with the USD anchor underneath. */
function NearAmount({
  usd,
  usdPerN,
  big,
  testId,
}: {
  usd: number;
  usdPerN: number;
  big?: boolean;
  testId?: string;
}) {
  const n = usdToN(usd, usdPerN);
  return (
    <span className={big ? 'block' : 'block text-right'} data-testid={testId}>
      <span className={`num block font-bold text-ink ${big ? 'text-2xl' : 'text-sm'}`}>
        {formatN(n, { maxFractionDigits: big ? 0 : 1 })}
      </span>
      <span className={`num block text-ink ${big ? 'text-xs' : 'text-2xs'}`}>
        {formatUsd(usd)}
      </span>
    </span>
  );
}

function RateBreakdownSection({
  lines,
  totalPct,
  capUsd,
  premiumUsd,
  usdPerN,
  testId,
}: {
  lines: RateLine[];
  totalPct: number;
  capUsd: number;
  premiumUsd: number;
  usdPerN: number;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="text-2xs font-bold uppercase tracking-wider text-ink">
        {FLOW_COPY.totalRate}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lines.map((line, i) => (
          <li key={line.label} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 text-body">
              {line.label}
              {line.coverageEffect !== undefined && (
                <span className="ml-1.5 inline-flex rounded border border-warn-line bg-warn-bg px-1.5 py-px text-2xs font-semibold text-warn">
                  {line.coverageEffect}
                </span>
              )}
            </span>
            <span className="num flex-none text-ink">
              {i === 0 ? '' : '+'}
              {formatPct(line.points)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-2 text-xs">
        <span className="font-semibold text-ink">{FLOW_COPY.totalRate}</span>
        <span className="num font-semibold text-ink">{formatPct(totalPct)}</span>
      </div>
      <div className="num mt-1 text-right text-2xs text-ink">
        {formatPct(totalPct)} × {formatUsd(capUsd)} = {formatUsd(premiumUsd)} ≈{' '}
        {formatN(usdToN(premiumUsd, usdPerN), { maxFractionDigits: 1 })}
      </div>
    </div>
  );
}

function CoverMapSection({
  agent,
  capUsd,
  usdPerN,
}: {
  agent: Agent;
  capUsd: number;
  usdPerN: number;
}) {
  return (
    <div data-testid={`cover-map-${agent.id}`}>
      <div className="text-2xs font-bold uppercase tracking-wider text-ink">
        {FLOW_COPY.coverMapTitle}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {COVER_MAP_ROWS.map(({ letter, route }) => {
          const card = COVERAGE_CARDS.find((c) => c.route === route);
          const excluded = route === 'B' && !agent.controls.tier2.attestation;
          const limitUsd = perEventLimit(route, capUsd);
          return (
            <li
              key={letter}
              className="flex items-baseline justify-between gap-3 text-xs"
              data-testid={`cover-map-${agent.id}-${letter}`}
            >
              <span className={`min-w-0 ${excluded ? 'text-body line-through' : 'text-body'}`}>
                <b className="text-ink no-underline">Coverage {letter}.</b> {card?.title}
              </span>
              {excluded ? (
                <span className="inline-flex flex-none rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                  {FLOW_COPY.coverMapExcluded}
                </span>
              ) : (
                <span className="num flex-none text-ink">
                  up to {formatN(usdToN(limitUsd, usdPerN), { maxFractionDigits: 0 })}{' '}
                  ({formatUsd(limitUsd)})
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-line-soft pt-2 text-2xs text-body">
        {FLOW_COPY.coverMapLimitNote}
      </p>
    </div>
  );
}

function joinPlain(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function StackSection({ agent, usdPerN }: { agent: Agent; usdPerN: number }) {
  const rows = stackRows(agent);
  const capUsd = recommendedCapUsd(agent);
  const missing = rows.filter((r) => !r.on);
  const potentialUsd = capUsd + missing.reduce((a, r) => a + r.addUsd, 0);
  return (
    <div data-testid={`stack-${agent.id}`}>
      <div className="text-2xs font-bold uppercase tracking-wider text-ink">
        {FLOW_COPY.stackTitle}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        <li className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-body">{FLOW_COPY.stackBase}</span>
          <span className="num flex-none text-ink">{formatUsd(CAP_BASE_USD)}</span>
        </li>
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-baseline justify-between gap-3 text-xs"
            data-testid={`stack-${agent.id}-${row.key}`}
          >
            <span className="flex items-center gap-2 text-body">
              <span
                className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-[9px] font-bold ${
                  row.on ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'
                }`}
              >
                {row.on ? '✓' : '✕'}
              </span>
              {FLOW_COPY.stackLabels[row.key]}
            </span>
            <span className="num flex-none text-ink">
              {row.on ? `+${formatUsd(row.addUsd)}` : '+$0'}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-2 text-xs">
        <span className="font-semibold text-ink">{FLOW_COPY.stackCoverAmount}</span>
        <span className="num font-semibold text-ink">
          {formatN(usdToN(capUsd, usdPerN), { maxFractionDigits: 0 })} ({formatUsd(capUsd)})
        </span>
      </div>
      <p className="mt-2 text-2xs text-body" data-testid={`stack-note-${agent.id}`}>
        {missing.length === 0
          ? FLOW_COPY.stackFull
          : FLOW_COPY.stackUpsell(
              joinPlain(missing.map((r) => FLOW_COPY.stackLabels[r.key])),
              formatUsd(potentialUsd),
            )}
      </p>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-wider text-ink">{title}</div>
      <p className="mt-1 text-xs text-body">{body}</p>
    </div>
  );
}

export default function FlowQuote() {
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const state = useStore((s) => s);
  const navigate = useNavigate();
  const selected = getSelectedAgentIds();
  const [expandedAgent, setExpandedAgent] = useState<string | undefined>();

  useEffect(() => {
    if (selected.length === 0) navigate('/', { replace: true });
  }, [selected.length, navigate]);

  // Dropping an agent terminates its unpaid quote and returns the agent to
  // a clean state; the totals recompute from the remaining rows.
  const removeAgent = (agentId: string) => {
    const s = useStore.getState();
    s.deEnrollAgent(agentId);
    s.setAgentStatus(agentId, 'Draft');
    setExpandedAgent(undefined);
    setSelectedAgentIds(selected.filter((id) => id !== agentId));
    if (selected.length === 1) navigate('/');
  };

  const rows = selected
    .map((id) => ({
      agent: agents.find((a) => a.id === id),
      enrollment: enrollments.find(
        (e) => e.agentId === id && e.terminatedAt === undefined,
      ),
    }))
    .filter(
      (r): r is { agent: NonNullable<typeof r.agent>; enrollment: NonNullable<typeof r.enrollment> } =>
        r.agent !== undefined && r.enrollment !== undefined,
    );

  if (selected.length === 0) return null;

  const maxCoverUsd = rows.length
    ? Math.max(...rows.map((r) => capUsdFor(state, r.agent.id)))
    : 0;
  const totalPremiumUsd = rows.reduce((a, r) => a + r.enrollment.premiumUsd, 0);

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-FlowQuote">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          {FLOW_COPY.quoteTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          {FLOW_COPY.quoteSub} {FLOW_COPY.quoteHint}
        </p>
      </div>

      <div className="mb-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="text-2xs font-bold uppercase tracking-widest text-ink">
            {FLOW_COPY.quoteTotalCover}
          </div>
          <div className="mt-1 flex items-baseline gap-2" data-testid="quote-total-cover">
            <span className="text-sm font-semibold text-ink">{FLOW_COPY.quoteUpTo}</span>
            <NearAmount usd={maxCoverUsd} usdPerN={usdPerN} big />
          </div>
          <p className="mt-2 text-xs text-body">{FLOW_COPY.quoteCoverEachSub}</p>
        </div>
        <div className="rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="text-2xs font-bold uppercase tracking-widest text-ink">
            {FLOW_COPY.quoteAnnualPremium}
          </div>
          <div className="mt-1" data-testid="quote-total-premium">
            <NearAmount usd={totalPremiumUsd} usdPerN={usdPerN} big />
          </div>
        </div>
      </div>
      <div className="mb-4 text-right text-2xs text-ink">
        <PriceChipInline />
      </div>

      <div className="rounded-card border border-line bg-panel shadow-card">
        <div className="flex items-center gap-x-4 border-b border-line px-4 py-2 text-2xs font-bold uppercase tracking-wider text-ink">
          <span className="w-3 flex-none" />
          <span className="min-w-0 flex-1">{FLOW_COPY.quoteColumns.agent}</span>
          <span className="w-24 flex-none text-right">{FLOW_COPY.quoteColumns.cover}</span>
          <span className="w-14 flex-none text-right">{FLOW_COPY.quoteColumns.rate}</span>
          <span className="w-28 flex-none text-right">
            {FLOW_COPY.quoteColumns.premium}
          </span>
        </div>
        <ul className="divide-y divide-line-soft">
          {rows.map(({ agent, enrollment }) => {
            const open = expandedAgent === agent.id;
            const totalPct = enrollmentRatePct(enrollment);
            const capUsd = capUsdFor(state, agent.id);
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  data-testid={`quote-row-${agent.id}`}
                  aria-expanded={open}
                  onClick={() => setExpandedAgent(open ? undefined : agent.id)}
                  className="flex w-full items-center gap-x-4 px-4 py-3 text-left"
                >
                  <span className="w-3 flex-none text-2xs text-ink">{open ? '▾' : '▸'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-semibold text-ink">
                      {agent.name}
                    </span>
                    {coverageBExcluded(enrollment) && (
                      <span className="mt-0.5 inline-flex rounded border border-bad-line bg-bad-bg px-1.5 py-px text-2xs font-semibold text-bad">
                        {FLOW_COPY.quoteBExcluded}
                      </span>
                    )}
                  </span>
                  <span className="w-24 flex-none" data-testid={`quote-cover-${agent.id}`}>
                    <NearAmount usd={capUsd} usdPerN={usdPerN} />
                  </span>
                  <span className="num w-14 flex-none text-right text-xs text-ink">
                    {totalPct}%
                  </span>
                  <span className="w-28 flex-none">
                    <NearAmount usd={enrollment.premiumUsd} usdPerN={usdPerN} />
                  </span>
                </button>
                {open && (
                  <div className="border-t border-line-soft bg-canvas px-4 py-4">
                    <div className="num mb-4 text-2xs text-ink">
                      {agent.harness.name} {agent.harness.version} ·{' '}
                      {controlsSummary(agent)} · {shortHash(agent.configHash)}
                    </div>
                    <div className="flex flex-col gap-5">
                      <StackSection agent={agent} usdPerN={usdPerN} />
                      <RateBreakdownSection
                        lines={[...enrollment.rateBreakdown, ...enrollment.loadings]}
                        totalPct={totalPct}
                        capUsd={capUsd}
                        premiumUsd={enrollment.premiumUsd}
                        usdPerN={usdPerN}
                        testId={`quote-breakdown-${agent.id}`}
                      />
                      <CoverMapSection agent={agent} capUsd={capUsd} usdPerN={usdPerN} />
                      <InfoBlock
                        title={FLOW_COPY.deductibleTitle}
                        body={FLOW_COPY.deductibleBody}
                      />
                      <InfoBlock
                        title={FLOW_COPY.limitsTitle}
                        body={FLOW_COPY.limitsBody(
                          formatN(usdToN(capUsd, usdPerN), { maxFractionDigits: 0 }),
                          formatUsd(capUsd),
                        )}
                      />
                      <InfoBlock
                        title={FLOW_COPY.claimsTitle}
                        body={FLOW_COPY.claimsBody}
                      />
                    </div>
                    <div className="mt-4 flex justify-end border-t border-line-soft pt-3">
                      <button
                        type="button"
                        data-testid={`quote-remove-${agent.id}`}
                        onClick={() => removeAgent(agent.id)}
                        className="text-2xs font-semibold text-bad"
                      >
                        {FLOW_COPY.quoteRemove}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          data-testid="flow-quote-accept"
          onClick={() => navigate('/flow/terms/1')}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-ink"
        >
          {FLOW_COPY.quoteAccept}
        </button>
      </div>
    </div>
  );
}
