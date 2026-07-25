/**
 * WP-2 wizard progress stepper (mockups wizard-*.html): seven steps —
 * Company → Agent → Mandate → Controls → Quote → Fleet → Pay & activate.
 * Done steps render a green check; the current step is highlighted; a
 * progress bar under the labels shows how far along the purchase is.
 * WizardBack is the shared back control: plain navigation, with an optional
 * confirm when leaving would cancel something in progress.
 */
import { useNavigate } from 'react-router-dom';

export type WizardStepKey =
  | 'company'
  | 'agent'
  | 'mandate'
  | 'controls'
  | 'quote'
  | 'fleet'
  | 'pay'
  | 'review'
  | 'confirm';

const OPERATOR_STEPS: { key: WizardStepKey; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'agent', label: 'Agent' },
  { key: 'mandate', label: 'Mandate' },
  { key: 'controls', label: 'Controls' },
  { key: 'quote', label: 'Quote' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'pay', label: 'Pay & activate' },
];

const PRINCIPAL_STEPS: { key: WizardStepKey; label: string }[] = [
  { key: 'company', label: 'Organization' },
  { key: 'review', label: 'Review & countersign' },
  { key: 'confirm', label: 'Confirmation' },
];

export interface WizardStepperProps {
  current: WizardStepKey;
  /** 'principal' renders the short countersignature journey. */
  flow?: 'operator' | 'principal';
  className?: string;
}

export function WizardStepper({ current, flow = 'operator', className = '' }: WizardStepperProps) {
  const STEPS = flow === 'principal' ? PRINCIPAL_STEPS : OPERATOR_STEPS;
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  const progressPct = (currentIdx / (STEPS.length - 1)) * 100;
  return (
    <div className={className} data-testid="wizard-stepper">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {STEPS.map((step, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
          return (
            <span key={step.key} className="flex items-center gap-1.5 text-xs" data-state={state}>
              <span
                className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                  state === 'done'
                    ? 'bg-good-bg text-good'
                    : state === 'current'
                      ? 'bg-accent text-ink'
                      : 'bg-line-soft text-faint'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span
                className={
                  state === 'current'
                    ? 'font-semibold text-ink'
                    : state === 'done'
                      ? 'text-body'
                      : 'text-faint'
                }
              >
                {step.label}
              </span>
            </span>
          );
        })}
      </div>
      <div
        className="mt-2 h-1 w-full max-w-[560px] overflow-hidden rounded-full bg-line-soft"
        data-testid="wizard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={currentIdx + 1}
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="mt-1 text-2xs font-semibold uppercase tracking-widest text-faint">
        Step {Math.max(1, currentIdx + 1)} of {STEPS.length}
      </div>
    </div>
  );
}

export interface WizardBackProps {
  /** Route of the previous step. */
  to: string;
  /** Confirm message when leaving cancels something in progress. */
  warn?: string;
  /**
   * Tooltip on the button (e.g. what going back keeps). Never rendered as
   * visible caption text — entered data persisting is expected behavior, so
   * the UI does not announce it.
   */
  note?: string;
  className?: string;
}

export function WizardBack({ to, warn, note, className = '' }: WizardBackProps) {
  const navigate = useNavigate();
  return (
    <div className={className}>
      <button
        type="button"
        data-testid="wizard-back"
        title={note}
        onClick={() => {
          if (warn !== undefined && !window.confirm(warn)) return;
          navigate(to);
        }}
        className="flex items-center gap-1 rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
      >
        ← Back
      </button>
    </div>
  );
}
