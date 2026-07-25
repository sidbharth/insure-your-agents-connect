/**
 * ExclusionWall (REQ-7.6.2, GT-4): the plain "what is never covered" wall.
 * NOT collapsible by default — showing what's not covered, unprompted, is a
 * deliberate credibility feature for this audience.
 */
import { EXCLUSION_WALL } from '../data/copy';

export interface ExclusionWallProps {
  className?: string;
}

export function ExclusionWall({ className = '' }: ExclusionWallProps) {
  return (
    <div
      data-testid="exclusion-wall"
      className={`rounded-card border border-line bg-panel shadow-card ${className}`}
    >
      <div className="border-b border-line-soft px-5 py-3">
        <h2 className="text-md">Exclusions</h2>
        <p className="mt-0.5 text-xs text-muted">The policy does not cover the following.</p>
      </div>
      <ul className="divide-y divide-line-soft px-5">
        {EXCLUSION_WALL.map((item) => (
          <li key={item} className="flex items-start gap-2.5 py-2.5 text-sm text-body">
            <span className="mt-1 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-bad-bg text-[9px] font-bold text-bad">
              ✕
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
