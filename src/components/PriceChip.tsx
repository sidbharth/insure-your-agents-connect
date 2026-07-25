/**
 * Persistent price chip (plan §1, GT-9, AC-15):
 * "1 N = $3.02 · CoinGecko · live · 14:31:07", or "stale", or "pinned $3.00".
 * Lives in the header; every N display traces to this rate/source/timestamp.
 */
import { formatRate } from '../lib/money';
import { useStore } from '../store';
import { priceFeedMode } from './helpers';

export interface PriceChipProps {
  className?: string;
}

export function PriceChip({ className = '' }: PriceChipProps) {
  const feed = useStore((s) => s.priceFeed);

  const mode = priceFeedMode(feed);

  return (
    <span
      data-testid="price-chip"
      data-mode={mode}
      className={`num inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-[#e2e6e3] ${className}`}
    >
      <b className="font-semibold text-white">{formatRate(feed.usdPerN)}</b>
      {mode === 'stale' && (
        <span className="rounded-sm bg-[#e8a13c] px-1 py-px text-[9px] font-extrabold tracking-widest text-[#3c2b06]">
          PRICE STALE
        </span>
      )}
      {mode === 'pinned' && (
        <span className="rounded-sm bg-[#a3adaa] px-1 py-px text-[9px] font-extrabold tracking-widest text-ink">
          PINNED
        </span>
      )}
    </span>
  );
}
