/**
 * UnverifiedBanner (REQ-7.2.1, decision D1): the persistent amber banner
 * rendered in the shell whenever the operator is unverified. States both
 * consequences in one breath; never uses the word "mandatory".
 */
import { Link } from 'react-router-dom';
import { UNVERIFIED_BANNER } from '../data/copy';
import { verificationCurrentAt } from '../lib/conditions';
import { demoNow } from '../lib/demoClock';
import { useStore } from '../store';

export interface UnverifiedBannerProps {
  className?: string;
}

export function isOperatorVerifiedNow(
  history: { from: number; to?: number; verified: boolean }[],
): boolean {
  return verificationCurrentAt(history, demoNow());
}

export function UnverifiedBanner({ className = '' }: UnverifiedBannerProps) {
  const history = useStore((s) => s.operator.verificationHistory);
  // subscribe to time offset so fast-forward re-evaluates verification state
  useStore((s) => s.presenter.timeOffsetMs);

  if (isOperatorVerifiedNow(history)) return null;

  return (
    <div
      data-testid="unverified-banner"
      className={`flex items-center gap-3 border-b border-warn-line bg-warn-bg px-7 py-2.5 text-sm text-warn ${className}`}
    >
      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-warn-deep text-2xs font-extrabold text-white">
        !
      </span>
      <span>{UNVERIFIED_BANNER}</span>
      <Link
        to="/verify"
        className="ml-auto flex-none rounded-lg bg-warn-deep px-3 py-1 text-xs font-semibold text-white"
      >
        Complete verification
      </Link>
    </div>
  );
}
