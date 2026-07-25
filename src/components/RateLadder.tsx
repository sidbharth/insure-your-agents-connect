/**
 * RateLadder (plan §4 display rule, REQ-7.5.2, AC-4):
 * renders ladder slices up to the 3.0% tier-2 ladder ceiling line ("ladder
 * ceiling — never more than this for skipped controls"), and renders
 * post-clamp loadings (concentration +0.1, open-set +0.3) as separate
 * labeled lines BELOW/OUTSIDE the ladder — so the displayed total may
 * legitimately reach 3.4%. Frozen props — WP-2/3 consume.
 */
import { formatPct } from '../lib/money';
import type { RateLine } from '../store/types';

export const LADDER_CEILING_PCT = 3.0;

export interface RateLadderProps {
  /** Ladder-group lines (base + tier-2 surcharges), pre-clamp order. */
  ladder: RateLine[];
  /** Post-clamp loading lines (concentration / open-set), rendered below. */
  loadings: RateLine[];
  /** Ladder hit 3.0 exactly — shows the "ceiling reached" state. */
  ceilingReached: boolean;
  /** Pixel height of the ladder column (default 240 per mockups). */
  heightPx?: number;
  className?: string;
}

const SLICE_COLORS = [
  '#00EC97', // base — NEAR green
  '#5bf2b8',
  '#8ff7cd',
  '#b4fadd',
  '#cdfce8',
  '#defdf0',
  '#e9fef5',
  '#f2fff9',
];

export function RateLadder({
  ladder,
  loadings,
  ceilingReached,
  heightPx = 240,
  className = '',
}: RateLadderProps) {
  const pxPerPoint = heightPx / LADDER_CEILING_PCT;

  return (
    <div className={className} data-testid="rate-ladder">
      <div className="flex gap-3.5">
        {/* ladder column */}
        <div className="relative w-[74px] flex-none" style={{ height: heightPx }}>
          <div
            className={`absolute left-[84px] top-[-7px] w-40 text-2xs ${
              ceilingReached ? 'font-semibold text-bad' : 'text-faint'
            }`}
          >
            3.0% ladder ceiling for skipped controls
          </div>
          {/* track: ladder slices, then loading slices above them. Loadings
              apply after the ceiling, so they may extend past the dashed line. */}
          <div className="absolute inset-0 flex flex-col-reverse rounded-md border border-line-soft bg-[#edf0ee]">
            {ladder.map((line, i) => (
              <div
                key={line.label}
                data-testid="ladder-slice"
                title={`${line.label}: ${formatPct(line.points, { signed: i > 0 })}`}
                className="num flex items-center justify-center text-[10px] font-semibold leading-none text-[#0b3b28]"
                style={{
                  height: Math.max(2, line.points * pxPerPoint),
                  background: SLICE_COLORS[Math.min(i, SLICE_COLORS.length - 1)],
                  boxShadow: i > 0 ? 'inset 0 1px 0 rgba(255,255,255,.9)' : undefined,
                }}
              >
                {line.points * pxPerPoint >= 12 ? formatPct(line.points, { signed: i > 0 }) : ''}
              </div>
            ))}
            {loadings.map((line) => (
              <div
                key={line.label}
                data-testid="ladder-loading-slice"
                title={`${line.label}: ${formatPct(line.points, { signed: true })}`}
                className="num flex items-center justify-center text-[10px] font-semibold leading-none text-white"
                style={{
                  height: Math.max(2, line.points * pxPerPoint),
                  background: '#d98a1f',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)',
                }}
              >
                {line.points * pxPerPoint >= 12 ? formatPct(line.points, { signed: true }) : ''}
              </div>
            ))}
          </div>
          {/* ceiling line, drawn above the track */}
          <div
            className={`absolute inset-x-[-6px] top-0 z-10 border-t-2 border-dashed ${
              ceilingReached ? 'border-bad' : 'border-faint'
            }`}
            data-testid="ladder-ceiling-line"
          />
        </div>
        {/* legend: mirrors the bar, top slice first */}
        <div className="flex flex-1 flex-col justify-end gap-1.5 text-2xs">
          {[...loadings].reverse().map((line) => (
            <div key={line.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 flex-none rounded-sm" style={{ background: '#d98a1f' }} />
              <span className="flex-1 text-muted">{line.label}</span>
              <b className="num text-warn">{formatPct(line.points, { signed: true })}</b>
            </div>
          ))}
          {[...ladder].reverse().map((line, ri) => {
            const i = ladder.length - 1 - ri;
            return (
              <div key={line.label} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 flex-none rounded-sm"
                  style={{ background: SLICE_COLORS[Math.min(i, SLICE_COLORS.length - 1)] }}
                />
                <span className="flex-1 text-muted">{line.label}</span>
                {ladder.length + loadings.length > 1 && (
                  <b className="num text-ink">{formatPct(line.points, { signed: i > 0 })}</b>
                )}
              </div>
            );
          })}
          {ceilingReached && (
            <div
              data-testid="ceiling-reached"
              className="mt-1 rounded border border-bad-line bg-bad-bg px-2 py-1 font-semibold text-bad"
            >
              Ceiling reached. The ladder never exceeds 3.0%.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
