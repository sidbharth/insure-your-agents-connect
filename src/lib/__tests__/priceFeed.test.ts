/**
 * Price-feed slice tests (plan §6, AC-15) via the injected fetch:
 * fetch / refresh / outage-fallback / pin.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../store';
import { setPriceFetchFn } from '../../store/priceFeed';
import { SEED_USD_PER_N } from '../../data/seed';

beforeEach(() => {
  setPriceFetchFn(async () => 3.02);
  useStore.getState().reset();
});

afterEach(() => {
  setPriceFetchFn(undefined);
});

describe('priceFeed slice', () => {
  it('starts from the seed: $3.00, unpinned, source seed', () => {
    setPriceFetchFn(async () => {
      throw new Error('no fetch in this test');
    });
    useStore.getState().reset();
    const feed = useStore.getState().priceFeed;
    expect(feed.pinned).toBe(false);
    expect(feed.pinnedValue).toBe(3.0);
    expect(feed.usdPerN).toBe(SEED_USD_PER_N);
  });

  it('refetchNow() applies a successful live fetch: rate, source, fresh, lastKnown', async () => {
    setPriceFetchFn(async () => 3.14);
    await useStore.getState().refetchNow();
    const feed = useStore.getState().priceFeed;
    expect(feed.usdPerN).toBe(3.14);
    expect(feed.source).toBe('CoinGecko');
    expect(feed.stale).toBe(false);
    expect(feed.lastKnown).toBe(3.14);
  });

  it('a later refresh replaces the rate (drift)', async () => {
    setPriceFetchFn(async () => 3.1);
    await useStore.getState().refetchNow();
    setPriceFetchFn(async () => 2.95);
    await useStore.getState().refetchNow();
    expect(useStore.getState().priceFeed.usdPerN).toBe(2.95);
    expect(useStore.getState().priceFeed.lastKnown).toBe(2.95);
  });

  it('outage falls back to lastKnown and flags stale — every flow keeps working (REQ-6.3)', async () => {
    setPriceFetchFn(async () => 3.2);
    await useStore.getState().refetchNow();
    setPriceFetchFn(async () => {
      throw new Error('network down');
    });
    await useStore.getState().refetchNow();
    const feed = useStore.getState().priceFeed;
    expect(feed.usdPerN).toBe(3.2); // lastKnown retained
    expect(feed.stale).toBe(true);
  });

  it('outage with no live fetch ever falls back to the seed $3.00', async () => {
    setPriceFetchFn(async () => {
      throw new Error('network down');
    });
    useStore.getState().reset();
    await useStore.getState().refetchNow();
    const feed = useStore.getState().priceFeed;
    expect(feed.usdPerN).toBe(3.0);
    expect(feed.stale).toBe(true);
  });

  it('a fresh success clears the stale flag', async () => {
    setPriceFetchFn(async () => {
      throw new Error('down');
    });
    await useStore.getState().refetchNow();
    expect(useStore.getState().priceFeed.stale).toBe(true);
    setPriceFetchFn(async () => 3.05);
    await useStore.getState().refetchNow();
    expect(useStore.getState().priceFeed.stale).toBe(false);
    expect(useStore.getState().priceFeed.usdPerN).toBe(3.05);
  });

  it('pin sets the effective rate to exactly $3.00; live fetches keep lastKnown updated', async () => {
    setPriceFetchFn(async () => 3.4);
    await useStore.getState().refetchNow();
    useStore.getState().pinPrice();
    let feed = useStore.getState().priceFeed;
    expect(feed.pinned).toBe(true);
    expect(feed.usdPerN).toBe(3.0);

    // background refresh while pinned: effective rate stays pinned
    setPriceFetchFn(async () => 3.5);
    await useStore.getState().refetchNow();
    feed = useStore.getState().priceFeed;
    expect(feed.usdPerN).toBe(3.0);
    expect(feed.lastKnown).toBe(3.5);
  });

  it('unpin returns to the live feed (lastKnown immediately, fresh fetch resumes)', async () => {
    setPriceFetchFn(async () => 3.3);
    await useStore.getState().refetchNow();
    useStore.getState().pinPrice();
    setPriceFetchFn(async () => 3.33);
    useStore.getState().unpinPrice();
    expect(useStore.getState().priceFeed.pinned).toBe(false);
    // unpin triggers a refetch; wait a tick for it to land
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().priceFeed.usdPerN).toBe(3.33);
  });
});
