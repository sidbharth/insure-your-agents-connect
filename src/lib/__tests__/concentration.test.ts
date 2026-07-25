/**
 * Concentration engine tests (plan §4b, AC-6): prospective post-enrollment
 * book, strict > 40% threshold, Appendix B crossings, retain-on-drop,
 * lapse-for-new.
 */
import { describe, expect, it } from 'vitest';
import { createSeedBook, HELIOS, SEED_CAP_USD } from '../../data/seed';
import {
  currentShare,
  enroll,
  loadingApplies,
  prospectiveShare,
} from '../concentration';
import type { ProgrammeBook } from '../../store/types';
import { ATLAS, BEACON } from '../../data/seed';

/**
 * Replay the fixed enrollment order (plan §7): Procurement-Bot (wizard),
 * then the import sweep — Legacy-Bot (Atlas), Relay-Bot (Beacon), then the
 * nine Helios agents. `count` = how many of the 12 have enrolled.
 */
const ENROLL_ORDER = [
  HELIOS, // Procurement-Bot
  ATLAS, // Legacy-Bot
  BEACON, // Relay-Bot
  HELIOS, HELIOS, HELIOS, HELIOS, // Payables, Refunds, Treasury, Vendor
  HELIOS, HELIOS, HELIOS, HELIOS, HELIOS, // Settle .. Clearing
];

function bookAfter(count: number): ProgrammeBook {
  let book = createSeedBook();
  for (const component of ENROLL_ORDER.slice(0, count)) {
    book = enroll(book, component, SEED_CAP_USD).book;
  }
  return book;
}

describe('Appendix B crossings', () => {
  it('Procurement-Bot takes Helios to 2,140,000/5,550,000 = 38.6%', () => {
    const d = enroll(createSeedBook(), HELIOS, SEED_CAP_USD);
    expect(d.shareAfter).toBeCloseTo(2_140_000 / 5_550_000, 10);
    expect(d.shareAfter).toBeCloseTo(0.3856, 4);
    expect(d.loadingApplied).toBe(false);
  });

  it('Vendor-Bot lands at exactly 40.0000% (2,340,000/5,850,000) → NO loading', () => {
    // Before Vendor-Bot: Procurement, Legacy, Relay, Payables, Refunds, Treasury.
    const book = bookAfter(6);
    const share = prospectiveShare(book, HELIOS, SEED_CAP_USD);
    expect(share).toBeCloseTo(2_340_000 / 5_850_000, 12);
    expect(share).toBe(0.4); // exactly 40.0000%
    expect(loadingApplies(book, HELIOS, SEED_CAP_USD)).toBe(false);
    const d = enroll(book, HELIOS, SEED_CAP_USD);
    expect(d.loadingApplied).toBe(false);
  });

  it('Settle-Bot crosses at 40.5085% (2,390,000/5,900,000) → loading', () => {
    const book = bookAfter(7); // through Vendor-Bot
    const share = prospectiveShare(book, HELIOS, SEED_CAP_USD);
    expect(share).toBeCloseTo(2_390_000 / 5_900_000, 12);
    expect(share).toBeCloseTo(0.405085, 6);
    expect(loadingApplies(book, HELIOS, SEED_CAP_USD)).toBe(true);
    const d = enroll(book, HELIOS, SEED_CAP_USD);
    expect(d.loadingApplied).toBe(true);
  });

  it('post-import Helios sits at 42.5% (2,590,000/6,100,000)', () => {
    const book = bookAfter(12); // the full fleet
    expect(currentShare(book, HELIOS)).toBeCloseTo(2_590_000 / 6_100_000, 12);
    expect(currentShare(book, HELIOS)).toBeCloseTo(0.4246, 4);
  });
});

describe('atomicity and purity', () => {
  it('enroll never mutates the input book', () => {
    const book = createSeedBook();
    const before = JSON.parse(JSON.stringify(book));
    enroll(book, HELIOS, SEED_CAP_USD);
    expect(book).toEqual(before);
  });

  it('the decision is made on the prospective book, then committed', () => {
    const book = bookAfter(7);
    const d = enroll(book, HELIOS, SEED_CAP_USD);
    expect(d.shareAfter).toBe(currentShare(d.book, HELIOS));
    expect(d.loadingApplied).toBe(d.shareAfter > 0.4);
  });
});

describe('retain-on-drop / lapse-for-new (REQ-7.7.2, AC-6)', () => {
  it('dropping the book below 40% never changes an existing enrollment decision', () => {
    // Settle-Bot enrolled WITH the loading; its decision is a frozen fact.
    const settleDecision = enroll(bookAfter(7), HELIOS, SEED_CAP_USD);
    expect(settleDecision.loadingApplied).toBe(true);

    // Presenter drops Helios external caps: the recorded decision object is
    // untouched — the loading lives in the enrollment's frozen rateBreakdown.
    const dropped: ProgrammeBook = {
      ...settleDecision.book,
      components: settleDecision.book.components.map((c) =>
        c.harness === HELIOS ? { ...c, externalCapsUsd: 1_000_000 } : c,
      ),
    };
    expect(currentShare(dropped, HELIOS)).toBeLessThan(0.4);
    expect(settleDecision.loadingApplied).toBe(true); // frozen, unchanged
  });

  it('enrollments made after the drop carry no loading', () => {
    const afterImport = bookAfter(12);
    expect(loadingApplies(afterImport, HELIOS, SEED_CAP_USD)).toBe(true);

    const dropped: ProgrammeBook = {
      ...afterImport,
      components: afterImport.components.map((c) =>
        c.harness === HELIOS ? { ...c, externalCapsUsd: 1_000_000 } : c,
      ),
    };
    const d = enroll(dropped, HELIOS, SEED_CAP_USD);
    expect(d.loadingApplied).toBe(false);
  });
});
