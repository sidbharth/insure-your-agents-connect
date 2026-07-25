/**
 * Small shared helpers used across components.
 */
import { formatClockTime, formatRate } from '../lib/money';
import { useStore } from '../store';
import type { PriceFeedState } from '../store/types';

/** Feed mode label: pin wins over staleness, else live. */
export function priceFeedMode(
  feed: Pick<PriceFeedState, 'pinned' | 'stale'>,
): 'pinned' | 'stale' | 'live' {
  return feed.pinned ? 'pinned' : feed.stale ? 'stale' : 'live';
}

/** Inline light-background rate text: "1 $NEAR = $3.00 (live, 14:31:07)". */
export function PriceChipInline() {
  const feed = useStore((s) => s.priceFeed);
  const mode = priceFeedMode(feed);
  return (
    <span className="num" data-testid="price-inline">
      {formatRate(feed.usdPerN)} ({mode}, {formatClockTime(feed.fetchedAt)})
    </span>
  );
}
