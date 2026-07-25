/**
 * Claim-clock state machine + business-day math (plan §5c, finding 3) — WP-1.
 *
 * Anchor → deadline rules:
 * - discoveredAt → notify within 48 h (near-miss: 7 d). Operator's clock.
 * - notifiedAt → acknowledgedAt within 2 business days. Insurer.
 * - packageReceivedAt → incompleteNoticeAt within 5 business days if any
 *   applicable item is still `missing`. Insurer.
 * - packageCompleteAt set when the LAST applicable item flips auto/uploaded
 *   (may equal the initial submission). An incomplete package BLOCKS the
 *   determination clock entirely — the 30-day window starts only at
 *   packageCompleteAt, never at packageReceivedAt.
 * - packageCompleteAt → determinedAt within 30 days. Insurer.
 * - determinedAt → paidAt within 10 days. Insurer.
 * Business-day math is weekday-only (UTC weekdays, deterministic).
 */
import type { ClaimPhase, ClockState, DeadlineRow, Timestamp } from '../store/types';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** One policy year (365 days). */
export const YEAR_MS = 365 * DAY_MS;

export const NOTIFY_WINDOW_MS = 48 * HOUR_MS;
export const NEAR_MISS_NOTIFY_WINDOW_MS = 7 * DAY_MS;
export const ACK_BUSINESS_DAYS = 2;
export const INCOMPLETE_NOTICE_BUSINESS_DAYS = 5;
export const DETERMINATION_DAYS = 30;
export const PAYMENT_DAYS = 10;

/** t + n calendar days. */
export function addDays(t: Timestamp, days: number): Timestamp {
  return t + days * DAY_MS;
}

/** t + n business days (weekday-only, UTC). Weekend landings roll forward. */
export function addBusinessDays(t: Timestamp, days: number): Timestamp {
  let cur = t;
  let remaining = days;
  while (remaining > 0) {
    cur += DAY_MS;
    const dow = new Date(cur).getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return cur;
}

function statusFor(
  anchorAt: Timestamp | undefined,
  dueAt: Timestamp,
): DeadlineRow['status'] {
  if (anchorAt === undefined) return 'pending';
  return anchorAt <= dueAt ? 'met' : 'missed';
}

/**
 * Deadline rows for the timeline UI. Rows whose trigger anchor is missing
 * render as `blocked` with no dueAt — in particular, the determination row
 * stays blocked while the package is incomplete (the 30-day clock never
 * starts from packageReceivedAt).
 */
export function deadlines(state: ClockState): DeadlineRow[] {
  const a = state.anchors;
  const rows: DeadlineRow[] = [];

  // 1. Notification — operator's clock.
  const notifyDue =
    a.discoveredAt + (state.nearMiss ? NEAR_MISS_NOTIFY_WINDOW_MS : NOTIFY_WINDOW_MS);
  rows.push({
    label: state.nearMiss ? 'Notify insurer (near-miss: 7 days)' : 'Notify insurer (48 hours)',
    dueAt: notifyDue,
    whoseClock: 'Operator',
    status: statusFor(a.notifiedAt, notifyDue),
  });

  // 2. Acknowledgment — insurer, 2 business days from notification.
  if (a.notifiedAt === undefined) {
    rows.push({
      label: 'Acknowledge (2 business days)',
      whoseClock: 'Insurer',
      status: 'blocked',
      note: 'starts at notification',
    });
  } else {
    const due = addBusinessDays(a.notifiedAt, ACK_BUSINESS_DAYS);
    rows.push({
      label: 'Acknowledge (2 business days)',
      dueAt: due,
      whoseClock: 'Insurer',
      status: statusFor(a.acknowledgedAt, due),
    });
  }

  // 3. Incomplete-package notice — insurer, 5 business days from receipt.
  //    Only applicable if the package was incomplete when first submitted.
  const completeOnFirstSubmission =
    a.packageReceivedAt !== undefined &&
    a.packageCompleteAt !== undefined &&
    a.packageCompleteAt <= a.packageReceivedAt;
  if (a.packageReceivedAt === undefined) {
    rows.push({
      label: 'Incomplete-package notice (5 business days)',
      whoseClock: 'Insurer',
      status: 'blocked',
      note: 'starts at first evidence submission',
    });
  } else if (!completeOnFirstSubmission) {
    const due = addBusinessDays(a.packageReceivedAt, INCOMPLETE_NOTICE_BUSINESS_DAYS);
    rows.push({
      label: 'Incomplete-package notice (5 business days)',
      dueAt: due,
      whoseClock: 'Insurer',
      status: statusFor(a.incompleteNoticeAt, due),
      note: 'lists the missing applicable items',
    });
  }
  // (complete on first submission → the notice row is not applicable at all)

  // 4. Determination — insurer, 30 days from a COMPLETE package only.
  if (a.packageCompleteAt === undefined) {
    rows.push({
      label: 'Determination (30 days)',
      whoseClock: 'Insurer',
      status: 'blocked',
      note:
        a.packageReceivedAt === undefined
          ? 'starts at a complete evidence package'
          : 'incomplete package (the determination clock has not started)',
    });
  } else {
    const due = addDays(a.packageCompleteAt, DETERMINATION_DAYS);
    rows.push({
      label: 'Determination (30 days)',
      dueAt: due,
      whoseClock: 'Insurer',
      status: statusFor(a.determinedAt, due),
    });
  }

  // 5. Payment — insurer, 10 days from determination.
  if (a.determinedAt === undefined) {
    rows.push({
      label: 'Payment (10 days)',
      whoseClock: 'Insurer',
      status: 'blocked',
      note: 'starts at determination',
    });
  } else {
    const due = addDays(a.determinedAt, PAYMENT_DAYS);
    rows.push({
      label: 'Payment (10 days)',
      dueAt: due,
      whoseClock: 'Insurer',
      status: statusFor(a.paidAt, due),
    });
  }

  return rows;
}

/** Phase derived from the anchors (latest set anchor wins). */
export function phaseFromAnchors(state: ClockState): ClaimPhase {
  const a = state.anchors;
  if (a.paidAt !== undefined) return 'Paid';
  if (a.determinedAt !== undefined) return 'Determined';
  if (a.packageCompleteAt !== undefined) return 'PackageComplete';
  if (a.incompleteNoticeAt !== undefined) return 'IncompleteNoticed';
  if (a.packageReceivedAt !== undefined) return 'PackageReceived';
  if (a.acknowledgedAt !== undefined) return 'Acknowledged';
  if (a.notifiedAt !== undefined) return 'Notified';
  return 'Draft';
}

/**
 * Advance the state machine to `now` (presenter fast-forward drives this via
 * the demo clock). Insurer anchors auto-fill AT their due instants as their
 * windows elapse; operator anchors (notify, evidence submission/completion)
 * are never auto-filled — they are user actions. Pure: returns a new state.
 */
export function advance(state: ClockState, now: Timestamp): ClockState {
  const a = { ...state.anchors };

  // Insurer acknowledges within 2 bd of notification.
  if (a.notifiedAt !== undefined && a.acknowledgedAt === undefined) {
    const due = addBusinessDays(a.notifiedAt, ACK_BUSINESS_DAYS);
    if (now >= due) a.acknowledgedAt = due;
  }

  // Insurer flags an incomplete package within 5 bd of receipt — only while
  // the package is still incomplete.
  if (
    a.packageReceivedAt !== undefined &&
    a.packageCompleteAt === undefined &&
    a.incompleteNoticeAt === undefined
  ) {
    const due = addBusinessDays(a.packageReceivedAt, INCOMPLETE_NOTICE_BUSINESS_DAYS);
    if (now >= due) a.incompleteNoticeAt = due;
  }

  // Determination only ever runs from a COMPLETE package (30 days).
  if (a.packageCompleteAt !== undefined && a.determinedAt === undefined) {
    const due = addDays(a.packageCompleteAt, DETERMINATION_DAYS);
    if (now >= due) a.determinedAt = due;
  }

  // Payment within 10 days of determination (cascades within one advance).
  if (a.determinedAt !== undefined && a.paidAt === undefined) {
    const due = addDays(a.determinedAt, PAYMENT_DAYS);
    if (now >= due) a.paidAt = due;
  }

  const next: ClockState = { ...state, anchors: a };
  return { ...next, phase: phaseFromAnchors(next) };
}
