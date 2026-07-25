/**
 * WP-4 dashboard helpers (screen 7.9): pure row-derivation over the frozen
 * store contracts. All state is read from interval histories at demo-now —
 * never from cached booleans — so presenter fast-forward and suspension
 * intervals are real state (plan §5b).
 */
import { DAY_MS } from '../../lib/clocks';
import { intervalCovers } from '../../lib/conditions';
import type {
  Agent,
  AgentStatus,
  Enrollment,
  Mandate,
  PendingMandateEdit,
  SuspensionInterval,
  Timestamp,
} from '../../store/types';
import { TIER1_GATES, TIER2_CONTROLS } from '../../store/types';

export { DAY_MS };

/** The open suspension interval covering `t`, if any (REQ-7.9.1). */
export function openSuspension(
  agent: Agent,
  t: Timestamp,
): SuspensionInterval | undefined {
  return agent.suspensionHistory.find(
    (iv) => iv.from <= t && (iv.to === undefined || t < iv.to),
  );
}

/**
 * Row status derived from interval histories at `t`: an open suspension
 * interval flips the pill to Suspended regardless of the cached status
 * field; otherwise the stored status stands.
 */
export function rowStatusAt(agent: Agent, t: Timestamp): AgentStatus {
  if (openSuspension(agent, t) !== undefined) return 'Suspended';
  return agent.status;
}

/** Sum of ladder points in an enrollment's frozen rate breakdown. */
export function ladderRatePct(enrollment: Enrollment): number {
  const ladder = enrollment.rateBreakdown
    .filter((l) => l.group === 'ladder')
    .reduce((a, l) => a + l.points, 0);
  return Math.round(ladder * 100) / 100;
}

/** Sum of loading points (post-clamp lines, rendered outside the ladder). */
export function loadingsPct(enrollment: Enrollment): number {
  const fromBreakdown = enrollment.rateBreakdown
    .filter((l) => l.group === 'loading')
    .reduce((a, l) => a + l.points, 0);
  const fromLoadings =
    fromBreakdown > 0
      ? 0
      : enrollment.loadings.reduce((a, l) => a + l.points, 0);
  return Math.round((fromBreakdown + fromLoadings) * 100) / 100;
}

/** Displayed total rate: ladder + loadings (may exceed 3.0, max 3.4). */
export function totalRatePct(enrollment: Enrollment): number {
  return Math.round((ladderRatePct(enrollment) + loadingsPct(enrollment)) * 100) / 100;
}

/** Newest mandate version for an agent (last in the ordered list). */
export function newestMandate(
  versions: Mandate[] | undefined,
): Mandate | undefined {
  return versions === undefined || versions.length === 0
    ? undefined
    : versions[versions.length - 1];
}

/** Tier-1 gate on/off at `t` from gateHistory (4 dots). */
export function tier1DotsAt(agent: Agent, t: Timestamp): boolean[] {
  return TIER1_GATES.map((g) => intervalCovers(agent.gateHistory[g], t));
}

/** Tier-2 control on/off at `t` from controlsHistory (7 dots). */
export function tier2DotsAt(agent: Agent, t: Timestamp): boolean[] {
  return TIER2_CONTROLS.map((c) => intervalCovers(agent.controlsHistory[c], t));
}

/** "12 Jun 2027" (en-GB short date, matching the mockups). */
export function fmtDate(ts: Timestamp): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "03 Jun" — short day-month for the guardrail-verification line. */
export function fmtDayMonth(ts: Timestamp): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "2 days ago" / "today" relative time for the near-miss feed. */
export function relTime(ts: Timestamp, now: Timestamp): string {
  const days = Math.floor((now - ts) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/** One dashboard row: agent + its live enrollment + mandate context. */
export interface PolicyRow {
  agent: Agent;
  /** The most recent enrollment for the agent (terminated ones included for the De-enrolled row). */
  enrollment: Enrollment;
  mandate: Mandate | undefined;
  capUsd: number;
  status: AgentStatus;
  suspension?: SuspensionInterval;
  pendingEdit?: PendingMandateEdit;
  ladderPct: number;
  loadingsPct: number;
  totalPct: number;
}

/**
 * Build the per-agent policy rows: one row per agent that has an
 * enrollment, in agent order. The newest enrollment per agent wins (a
 * de-enrolled agent keeps its terminated enrollment so the row can show
 * the refund line).
 */
export function buildPolicyRows(
  agents: Agent[],
  enrollments: Enrollment[],
  mandates: Record<string, Mandate[]>,
  pendingEdits: Record<string, PendingMandateEdit>,
  now: Timestamp,
): PolicyRow[] {
  const rows: PolicyRow[] = [];
  for (const agent of agents) {
    const own = enrollments.filter((e) => e.agentId === agent.id);
    if (own.length === 0) continue;
    const live = own.find((e) => e.terminatedAt === undefined);
    const enrollment = live ?? own[own.length - 1];
    const mandate = newestMandate(mandates[agent.id]);
    rows.push({
      agent,
      enrollment,
      mandate,
      capUsd: mandate?.caps.perTx ?? 50_000,
      status: rowStatusAt(agent, now),
      suspension: openSuspension(agent, now),
      pendingEdit: pendingEdits[agent.id],
      ladderPct: ladderRatePct(enrollment),
      loadingsPct: loadingsPct(enrollment),
      totalPct: totalRatePct(enrollment),
    });
  }
  return rows;
}
