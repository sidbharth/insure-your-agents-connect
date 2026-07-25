/**
 * Prospective-book concentration math (plan §4b, finding 8) — WP-1.
 *
 * Loading determination is ATOMIC on the prospective post-enrollment book:
 * share = (componentCaps + addedCap) / (totalCaps + addedCap); loading iff
 * strictly > 0.40; then commit. Appendix B: Vendor-Bot ends at exactly
 * 40.0000% → no loading; Settle-Bot at 40.5085% → loading. Existing
 * enrollments keep their frozen rates when the book later drops — dropping
 * below 40% only changes enrollments made AFTER the drop (REQ-7.7.2, AC-6).
 */
import type { ProgrammeBook } from '../store/types';

export const CONCENTRATION_THRESHOLD = 0.4;

function componentCapsUsd(book: ProgrammeBook, component: string): number {
  const external =
    book.components.find((c) => c.harness === component)?.externalCapsUsd ?? 0;
  const enrolled = book.enrolledCapsUsd[component] ?? 0;
  return external + enrolled;
}

function totalCapsUsd(book: ProgrammeBook): number {
  const external = book.components.reduce((a, c) => a + c.externalCapsUsd, 0);
  const enrolled = Object.values(book.enrolledCapsUsd).reduce((a, v) => a + v, 0);
  return external + enrolled;
}

/** Prospective share (0..1) of `component` if `addedCapUsd` were enrolled. */
export function prospectiveShare(
  book: ProgrammeBook,
  component: string,
  addedCapUsd: number,
): number {
  const total = totalCapsUsd(book) + addedCapUsd;
  if (total <= 0) return 0;
  return (componentCapsUsd(book, component) + addedCapUsd) / total;
}

/** Strictly > 0.40 on the prospective post-enrollment book. */
export function loadingApplies(
  book: ProgrammeBook,
  component: string,
  addedCapUsd: number,
): boolean {
  return prospectiveShare(book, component, addedCapUsd) > CONCENTRATION_THRESHOLD;
}

export interface EnrollDecision {
  loadingApplied: boolean;
  /** Post-commit share (0..1) of the component. */
  shareAfter: number;
  book: ProgrammeBook;
}

/**
 * Atomic: decide loading on the prospective book, then commit and return the
 * new book (the input book is never mutated — engines are pure).
 */
export function enroll(
  book: ProgrammeBook,
  component: string,
  capUsd: number,
): EnrollDecision {
  const loadingApplied = loadingApplies(book, component, capUsd);
  const shareAfter = prospectiveShare(book, component, capUsd);
  const next: ProgrammeBook = {
    components: book.components.map((c) => ({ ...c })),
    enrolledCapsUsd: {
      ...book.enrolledCapsUsd,
      [component]: (book.enrolledCapsUsd[component] ?? 0) + capUsd,
    },
  };
  return { loadingApplied, shareAfter, book: next };
}

/** Current (non-prospective) share of a component across the whole book. */
export function currentShare(book: ProgrammeBook, component: string): number {
  const total = totalCapsUsd(book);
  if (total <= 0) return 0;
  return componentCapsUsd(book, component) / total;
}
