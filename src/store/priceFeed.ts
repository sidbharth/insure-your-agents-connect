/**
 * Price-feed slice (plan §6, REQ-6.2/6.3, AC-15).
 *
 * - Fetch on store init, setInterval 60 s, and imperative refetchNow() used
 *   by payments.ts before every payment.
 * - Success: set usdPerN/fetchedAt/source/stale:false/lastKnown.
 * - Failure or 3 s timeout: keep lastKnown (or seed $3.00), stale: true.
 * - pinned (presenter): effective rate becomes exactly $3.00; unpin returns
 *   to live. Reset restores the seeded pinned:false (AC-16).
 * - The fetch function is injectable for tests (outage, drift, pin).
 */
import type { StateCreator } from 'zustand';
import { createSeedPriceFeed, SEED_USD_PER_N } from '../data/seed';
import { demoNow } from '../lib/demoClock';
import type { PriceFeedSlice, RootState } from './types';

export const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd';

export const REFRESH_INTERVAL_MS = 60_000;
export const FETCH_TIMEOUT_MS = 3_000;

/** Injectable fetch: returns the live USD-per-N price or throws. */
export type PriceFetchFn = (signal: AbortSignal) => Promise<number>;

const defaultFetch: PriceFetchFn = async (signal) => {
  const res = await fetch(COINGECKO_URL, { signal });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as { near?: { usd?: number } };
  const usd = json?.near?.usd;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
    throw new Error('CoinGecko: malformed price payload');
  }
  return usd;
};

let fetchFn: PriceFetchFn = defaultFetch;

/** Test hook: inject a fake fetch (pass undefined to restore the default). */
export function setPriceFetchFn(fn?: PriceFetchFn): void {
  fetchFn = fn ?? defaultFetch;
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

export const createPriceFeedSlice: StateCreator<RootState, [], [], PriceFeedSlice> = (
  set,
  get,
) => ({
  priceFeed: createSeedPriceFeed(),

  refetchNow: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const live = await fetchFn(controller.signal);
      set((s) => {
        const pinned = s.priceFeed.pinned;
        return {
          priceFeed: {
            ...s.priceFeed,
            // Pin overrides the effective rate but the live price still lands
            // in lastKnown so unpin returns to a fresh value.
            usdPerN: pinned ? s.priceFeed.pinnedValue : live,
            source: 'CoinGecko',
            fetchedAt: demoNow(),
            stale: false,
            lastKnown: live,
          },
        };
      });
    } catch {
      // Outage / timeout: fall back to lastKnown (or seed $3.00), mark stale,
      // keep every flow working (REQ-6.3).
      set((s) => ({
        priceFeed: {
          ...s.priceFeed,
          usdPerN: s.priceFeed.pinned
            ? s.priceFeed.pinnedValue
            : (s.priceFeed.lastKnown ?? SEED_USD_PER_N),
          stale: true,
        },
      }));
    } finally {
      clearTimeout(timer);
    }
  },

  pinPrice: () => {
    set((s) => ({
      priceFeed: { ...s.priceFeed, pinned: true, usdPerN: s.priceFeed.pinnedValue },
    }));
  },

  unpinPrice: () => {
    set((s) => ({
      priceFeed: {
        ...s.priceFeed,
        pinned: false,
        usdPerN: s.priceFeed.lastKnown ?? SEED_USD_PER_N,
      },
    }));
    // Resume with a fresh fetch so "live" is honest immediately.
    void get().refetchNow();
  },
});

/** Start the 60 s refresh loop + the initial fetch. Idempotent. */
export function startPriceFeed(store: { getState: () => RootState }): void {
  stopPriceFeed();
  void store.getState().refetchNow();
  intervalHandle = setInterval(() => {
    void store.getState().refetchNow();
  }, REFRESH_INTERVAL_MS);
}

export function stopPriceFeed(): void {
  if (intervalHandle !== undefined) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
