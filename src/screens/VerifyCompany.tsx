/**
 * Screen 7.2 — Verify your company / KYB (WP-2; mockups wizard-kyb-*.html).
 *
 * Pre-filled KYB form → "Verify company" → latency theater → green Verified
 * badge + timestamp (opens a verified interval via session.verifyOperator).
 * "Skip for now" shows both consequences in one breath — the +0.4% surcharge
 * AND no claims paid while unverified — never the word "mandatory"
 * (REQ-7.2.1); continuing unverified closes the verified interval and the
 * shell-owned amber UnverifiedBanner takes over. Completable later from 7.9
 * (WP-4) — this screen also works when revisited in either state.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LatencyTheater } from '../components/LatencyTheater';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { isOperatorVerifiedNow } from '../components/UnverifiedBanner';
import { SEED_EPOCH } from '../data/seed';
import { useStore } from '../store';
import { formatUtcStamp } from './wizard/format';
import { WizardBack, WizardStepper } from './wizard/Stepper';

type Phase = 'form' | 'verifying' | 'verified' | 'skip-confirm';

const VERIFY_STEPS = [
  { label: 'Checking the Swiss Commercial Register (Zefix)' },
  { label: 'Matching beneficial owners over 25%' },
  { label: 'Screening sanctions and watchlists' },
  { label: 'Issuing verification record' },
];

export default function VerifyCompany() {
  const navigate = useNavigate();
  const role = useStore((s) => s.role);
  const operator = useStore((s) => s.operator);
  const verifyOperator = useStore((s) => s.verifyOperator);
  const revokeVerification = useStore((s) => s.revokeVerification);
  useStore((s) => s.presenter.timeOffsetMs);

  const openVerified = operator.verificationHistory.find(
    (iv) => iv.verified && iv.to === undefined,
  );
  // Seed opens a verified interval at the epoch; the on-screen ceremony has
  // happened only if verification was (re)opened after it — or on revisit
  // when verification is simply current from an earlier ceremony.
  const ceremonyDone =
    openVerified !== undefined && openVerified.from > SEED_EPOCH;

  const [phase, setPhase] = useState<Phase>(ceremonyDone ? 'verified' : 'form');

  // form fields — pre-filled, editable, deterministic result
  const [legalName, setLegalName] = useState(operator.name);
  const [regNo, setRegNo] = useState(operator.registrationNumber);
  const [country, setCountry] = useState(operator.country);

  const verifiedNow = isOperatorVerifiedNow(operator.verificationHistory);

  const isPrincipal = role === 'principal';
  const nextPath = isPrincipal ? '/review' : '/connect';

  const startVerify = () => setPhase('verifying');
  const finishVerify = () => {
    verifyOperator();
    setPhase('verified');
  };
  const continueUnverified = () => {
    if (verifiedNow) {
      revokeVerification();
      // Verification withdrawn is a suspension trigger (REQ-7.9.1): any agent
      // already Active loses its condition precedent from this moment on.
      const s = useStore.getState();
      for (const a of s.agents) {
        if (a.status === 'Active') s.suspendAgent(a.id, 'verification withdrawn');
      }
    }
    navigate(nextPath);
  };

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-VerifyCompany">
      <WizardStepper current="company" flow={isPrincipal ? 'principal' : 'operator'} className="mb-3" />
      <WizardBack
        to="/"
        note="Going back keeps everything you've entered."
        warn={
          phase === 'verifying'
            ? 'Verification is still running. Going back cancels it and you will need to restart it. Go back anyway?'
            : undefined
        }
        className="mb-5"
      />

      <div className="mx-auto max-w-[720px]">
        <h1 className="text-xl font-bold text-ink">
          {isPrincipal ? 'Verify your organization' : 'Verify your company'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isPrincipal
            ? 'Verification identifies you as the enrolled Principal. Claim payments for your losses are made directly to your verified organization. This takes about a minute.'
            : 'Verification ties the policy to a named legal entity. It enables the programme to pursue recovery on your behalf and stand behind claims. This takes about a minute.'}
        </p>

        {/* Company details (pre-filled) */}
        <div className="mt-6 rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="text-2xs font-bold uppercase tracking-widest text-faint">
            Company details
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">
              Legal name
              <input
                data-testid="kyb-legal-name"
                className="mt-1 w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm font-normal text-ink"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                disabled={phase === 'verifying'}
              />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Registration number
              <input
                data-testid="kyb-reg-no"
                className="num mt-1 w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm font-normal text-ink"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                disabled={phase === 'verifying'}
              />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Country of registration
              <input
                data-testid="kyb-country"
                className="mt-1 w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm font-normal text-ink"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={phase === 'verifying'}
              />
            </label>
            <div className="block text-xs font-semibold text-muted">
              Beneficial owners over 25%
              <div className="mt-1 space-y-1">
                {operator.beneficialOwners.map((bo) => (
                  <div
                    key={bo.name}
                    className="flex justify-between rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm font-normal text-ink"
                  >
                    <span>{bo.name}</span>
                    <span className="num text-muted">{bo.sharePct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-2xs text-faint">
            Pre-filled from your registration details. Review and edit before
            verifying.
          </p>
        </div>

        {/* Action / result area */}
        {phase === 'form' && (
          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              data-testid="verify-company"
              onClick={startVerify}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
            >
              Verify company
            </button>
            <SimulatedBadge />
            <button
              type="button"
              data-testid="skip-for-now"
              onClick={() => setPhase('skip-confirm')}
              className="ml-auto text-sm text-muted underline decoration-dotted"
            >
              Skip for now
            </button>
          </div>
        )}

        {phase === 'verifying' && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              Verifying {legalName}… <SimulatedBadge />
            </div>
            <LatencyTheater steps={VERIFY_STEPS} onDone={finishVerify} />
          </div>
        )}

        {phase === 'verified' && openVerified && (
          <div className="mt-5">
            <div
              data-testid="kyb-verified-badge"
              className="flex items-center gap-3 rounded-card border border-good-line bg-good-bg p-4"
            >
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-good text-sm font-bold text-white">
                ✓
              </span>
              <div>
                <div className="text-sm font-bold text-good">Verified</div>
                <div className="num text-xs text-good" data-testid="kyb-verified-timestamp">
                  {formatUtcStamp(openVerified.from)}
                </div>
              </div>
              <SimulatedBadge className="ml-auto" />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                data-testid="kyb-continue"
                onClick={() => navigate(nextPath)}
                className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-[#0bd489]"
              >
                Continue
              </button>
              <p className="text-2xs text-faint">
                Verification is a condition precedent to claims: events are
                payable only while it is current.
              </p>
            </div>
          </div>
        )}

        {phase === 'skip-confirm' && (
          <div
            data-testid="skip-consequences"
            className="mt-5 rounded-card border border-warn-line bg-warn-bg p-5"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-warn">
              <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-warn-deep text-2xs font-extrabold text-white">
                !
              </span>
              Continuing unverified has two consequences
            </div>
            <div className="mt-3 space-y-2 text-sm text-warn">
              <p>
                <b className="num">+0.4%</b> is added to every quote for every
                agent, until verification completes.
              </p>
              <p>
                <b>No claim can be paid</b> for any event that happens while
                verification isn't current.
              </p>
              <p className="text-xs">
                Verifying later protects future events only. It is not
                retroactive.
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                data-testid="verify-instead"
                onClick={startVerify}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-ink hover:bg-[#0bd489]"
              >
                Verify instead
              </button>
              <button
                type="button"
                data-testid="continue-unverified"
                onClick={continueUnverified}
                className="rounded-lg border border-warn-line bg-panel px-4 py-1.5 text-sm font-semibold text-warn"
              >
                Continue unverified
              </button>
            </div>
          </div>
        )}

        {phase !== 'skip-confirm' && phase !== 'verified' && (
          <p className="mt-6 text-xs text-muted">
            Verification can also be completed later from My Policies.
            Verifying later removes the 0.4% surcharge pro rata and protects
            future events only.
          </p>
        )}
      </div>
    </div>
  );
}
