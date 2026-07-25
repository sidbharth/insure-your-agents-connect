/**
 * RetentionPreview (REQ-7.8.3, GT-7): "greater of 500 N or 2% of the loss —
 * not collected now, borne per event", with the two mandatory worked
 * examples computed at the displayed price. Frozen props — WP-3 consumes.
 */
import { RETENTION_FLOOR_N, RETENTION_LOSS_PCT } from '../lib/claims';
import { formatN, formatUsd } from '../lib/money';
import { useStore } from '../store';

export interface RetentionPreviewProps {
  /** Worked-example loss sizes (defaults per REQ-7.8.3: $30k and $200k). */
  exampleLossesUsd?: [number, number];
  className?: string;
}

export function RetentionPreview({
  exampleLossesUsd = [30_000, 200_000],
  className = '',
}: RetentionPreviewProps) {
  const usdPerN = useStore((s) => s.priceFeed.usdPerN);
  const retentionFloorUsd = RETENTION_FLOOR_N * usdPerN;

  const examples = exampleLossesUsd.map((loss) => {
    const pctUsd = RETENTION_LOSS_PCT * loss;
    const borneUsd = Math.max(retentionFloorUsd, pctUsd);
    const isFloor = retentionFloorUsd >= pctUsd;
    return { loss, borneUsd, isFloor };
  });

  return (
    <div
      data-testid="retention-preview"
      className={`rounded-card border border-line bg-panel p-4 shadow-card ${className}`}
    >
      <div className="text-2xs font-bold uppercase tracking-wider text-muted">
        Retention preview
      </div>
      <p className="mt-1 text-sm text-body">
        Per event you bear the greater of <b className="num">500 $NEAR</b> (
        <span className="num">{formatUsd(retentionFloorUsd)}</span> at today's
        price) or <b className="num">2%</b> of the loss. It is{' '}
        <b>not collected today</b> and applies per event.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {examples.map(({ loss, borneUsd, isFloor }) => (
          <li key={loss} className="num text-muted">
            e.g. a {formatUsd(loss)} loss → you bear{' '}
            <b className="text-ink">{formatUsd(borneUsd)}</b>{' '}
            ({isFloor ? `${formatN(RETENTION_FLOOR_N)}` : '2%'})
          </li>
        ))}
      </ul>
    </div>
  );
}
