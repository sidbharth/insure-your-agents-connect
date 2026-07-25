/**
 * Claim-clock state-machine tests (plan §5c, GT-5): incomplete package
 * blocks determination entirely, completion anchors, weekday-only business
 * days, and fast-forward phase transitions.
 */
import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  addDays,
  advance,
  deadlines,
  DAY_MS,
  HOUR_MS,
  phaseFromAnchors,
} from '../clocks';
import type { ClockState } from '../../store/types';

/** Mon 15 Jun 2026 09:00 UTC — a deterministic weekday anchor. */
const MON = Date.UTC(2026, 5, 15, 9, 0, 0);
const FRI = Date.UTC(2026, 5, 12, 9, 0, 0);

function draft(discoveredAt = MON): ClockState {
  return { phase: 'Draft', anchors: { discoveredAt } };
}

describe('business-day arithmetic (weekday-only)', () => {
  it('adds weekdays within a week', () => {
    expect(addBusinessDays(MON, 2)).toBe(MON + 2 * DAY_MS); // Mon → Wed
  });

  it('skips weekends: Fri + 2 bd = Tue', () => {
    expect(addBusinessDays(FRI, 2)).toBe(FRI + 4 * DAY_MS);
  });

  it('Fri + 5 bd spans the full weekend = next Fri', () => {
    expect(addBusinessDays(FRI, 5)).toBe(FRI + 7 * DAY_MS);
  });

  it('calendar days are plain arithmetic', () => {
    expect(addDays(MON, 30)).toBe(MON + 30 * DAY_MS);
  });
});

describe('deadline rows', () => {
  it('draft: 48 h notify due on the operator clock; everything else blocked', () => {
    const rows = deadlines(draft());
    const notify = rows[0];
    expect(notify.whoseClock).toBe('Operator');
    expect(notify.dueAt).toBe(MON + 48 * HOUR_MS);
    expect(notify.status).toBe('pending');
    for (const row of rows.slice(1)) expect(row.status).toBe('blocked');
  });

  it('near-miss claims get a 7-day notify window', () => {
    const rows = deadlines({ ...draft(), nearMiss: true });
    expect(rows[0].dueAt).toBe(MON + 7 * DAY_MS);
  });

  it('incomplete package → notice due received+5bd and NO determination deadline', () => {
    const state: ClockState = {
      phase: 'PackageReceived',
      anchors: {
        discoveredAt: MON,
        notifiedAt: MON + HOUR_MS,
        acknowledgedAt: MON + DAY_MS,
        packageReceivedAt: MON + 2 * DAY_MS, // Wed; package still incomplete
      },
    };
    const rows = deadlines(state);
    const notice = rows.find((r) => r.label.includes('Incomplete-package'))!;
    expect(notice.dueAt).toBe(addBusinessDays(MON + 2 * DAY_MS, 5)); // Wed + 5 bd = next Wed
    expect(notice.status).toBe('pending');
    const determination = rows.find((r) => r.label.includes('Determination'))!;
    expect(determination.status).toBe('blocked');
    expect(determination.dueAt).toBeUndefined();
    expect(determination.note).toMatch(/incomplete package/);
  });

  it('last item attached at t → packageCompleteAt = t and determination due t + 30 d, independent of packageReceivedAt', () => {
    const receivedAt = MON + 2 * DAY_MS;
    const completeAt = MON + 10 * DAY_MS; // last applicable item flips at t
    const state: ClockState = {
      phase: 'PackageComplete',
      anchors: {
        discoveredAt: MON,
        notifiedAt: MON + HOUR_MS,
        acknowledgedAt: MON + DAY_MS,
        packageReceivedAt: receivedAt,
        incompleteNoticeAt: addBusinessDays(receivedAt, 5),
        packageCompleteAt: completeAt,
      },
    };
    const determination = deadlines(state).find((r) => r.label.includes('Determination'))!;
    expect(determination.dueAt).toBe(completeAt + 30 * DAY_MS);
    expect(determination.dueAt).not.toBe(receivedAt + 30 * DAY_MS);
  });

  it('complete on first submission: both anchors set at once; the incomplete-notice row is not applicable', () => {
    const t = MON + 2 * DAY_MS;
    const state: ClockState = {
      phase: 'PackageComplete',
      anchors: {
        discoveredAt: MON,
        notifiedAt: MON + HOUR_MS,
        acknowledgedAt: MON + DAY_MS,
        packageReceivedAt: t,
        packageCompleteAt: t,
      },
    };
    const rows = deadlines(state);
    expect(rows.find((r) => r.label.includes('Incomplete-package'))).toBeUndefined();
    const determination = rows.find((r) => r.label.includes('Determination'))!;
    expect(determination.dueAt).toBe(t + 30 * DAY_MS);
  });

  it('payment due determined + 10 d once determined', () => {
    const state: ClockState = {
      phase: 'Determined',
      anchors: { discoveredAt: MON, determinedAt: MON + 20 * DAY_MS },
    };
    const payment = deadlines(state).find((r) => r.label.includes('Payment'))!;
    expect(payment.dueAt).toBe(MON + 30 * DAY_MS);
    expect(payment.whoseClock).toBe('Insurer');
  });

  it('met vs missed statuses reflect the anchor against its due instant', () => {
    const state: ClockState = {
      phase: 'Notified',
      anchors: { discoveredAt: MON, notifiedAt: MON + 49 * HOUR_MS }, // late
    };
    expect(deadlines(state)[0].status).toBe('missed');
    const onTime: ClockState = {
      phase: 'Notified',
      anchors: { discoveredAt: MON, notifiedAt: MON + HOUR_MS },
    };
    expect(deadlines(onTime)[0].status).toBe('met');
  });
});

describe('advance — fast-forward drives phase transitions', () => {
  const notified: ClockState = {
    phase: 'Notified',
    anchors: { discoveredAt: MON, notifiedAt: MON + HOUR_MS },
  };

  it('acknowledges after 2 business days', () => {
    const later = advance(notified, MON + 3 * DAY_MS);
    expect(later.anchors.acknowledgedAt).toBe(addBusinessDays(MON + HOUR_MS, 2));
    expect(later.phase).toBe('Acknowledged');
  });

  it('does not acknowledge early', () => {
    const early = advance(notified, MON + HOUR_MS + 1);
    expect(early.anchors.acknowledgedAt).toBeUndefined();
    expect(early.phase).toBe('Notified');
  });

  it('issues the incomplete notice at received+5bd while the package is incomplete', () => {
    const state: ClockState = {
      phase: 'PackageReceived',
      anchors: {
        discoveredAt: MON,
        notifiedAt: MON + HOUR_MS,
        acknowledgedAt: MON + DAY_MS,
        packageReceivedAt: MON + 2 * DAY_MS,
      },
    };
    const later = advance(state, MON + 20 * DAY_MS);
    expect(later.anchors.incompleteNoticeAt).toBe(addBusinessDays(MON + 2 * DAY_MS, 5));
    expect(later.phase).toBe('IncompleteNoticed');
    // Crucially: NO determination while the package is incomplete, however far we go.
    const far = advance(state, MON + 400 * DAY_MS);
    expect(far.anchors.determinedAt).toBeUndefined();
    expect(far.anchors.paidAt).toBeUndefined();
  });

  it('determines 30 d after completion and pays 10 d later (cascading)', () => {
    const completeAt = MON + 10 * DAY_MS;
    const state: ClockState = {
      phase: 'PackageComplete',
      anchors: {
        discoveredAt: MON,
        notifiedAt: MON + HOUR_MS,
        acknowledgedAt: MON + DAY_MS,
        packageReceivedAt: MON + 2 * DAY_MS,
        packageCompleteAt: completeAt,
      },
    };
    const determined = advance(state, completeAt + 30 * DAY_MS);
    expect(determined.anchors.determinedAt).toBe(completeAt + 30 * DAY_MS);
    expect(determined.phase).toBe('Determined');
    const paid = advance(determined, completeAt + 40 * DAY_MS);
    expect(paid.anchors.paidAt).toBe(completeAt + 40 * DAY_MS);
    expect(paid.phase).toBe('Paid');
    // One giant fast-forward cascades both.
    const both = advance(state, completeAt + 400 * DAY_MS);
    expect(both.phase).toBe('Paid');
  });

  it('is pure: the input state is never mutated', () => {
    const before = JSON.parse(JSON.stringify(notified));
    advance(notified, MON + 30 * DAY_MS);
    expect(notified).toEqual(before);
  });
});

describe('phaseFromAnchors', () => {
  it('derives each phase from the most advanced anchor', () => {
    const anchors = { discoveredAt: MON };
    expect(phaseFromAnchors({ phase: 'Draft', anchors })).toBe('Draft');
    expect(
      phaseFromAnchors({ phase: 'Draft', anchors: { ...anchors, notifiedAt: MON } }),
    ).toBe('Notified');
    expect(
      phaseFromAnchors({
        phase: 'Draft',
        anchors: { ...anchors, notifiedAt: MON, packageReceivedAt: MON, packageCompleteAt: MON },
      }),
    ).toBe('PackageComplete');
  });
});
