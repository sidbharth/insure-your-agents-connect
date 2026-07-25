/**
 * LatencyTheater (REQ-6.4): renders the staged sub-steps of a simulated
 * verification as a 1–2 s progress card. Frozen props — WP-2..5 consume.
 */
import { useEffect, useRef, useState } from 'react';
import { runLatencyTheater, type LatencyStep } from '../lib/latency';

export interface LatencyTheaterProps {
  /** The believable sub-steps, e.g. "Fetching tool manifest…". */
  steps: LatencyStep[];
  /** Fired once after the last step completes. */
  onDone: () => void;
  /** Total duration in ms (default 1,600; zero in latency test mode). */
  totalMs?: number;
  title?: string;
  className?: string;
}

export function LatencyTheater({
  steps,
  onDone,
  totalMs,
  title,
  className = '',
}: LatencyTheaterProps) {
  const [completed, setCompleted] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Unmount cancellation: a theater torn down mid-run (navigation, reset)
    // must never fire onDone or set state on an unmounted component. A
    // StrictMode remount simply restarts the run from step zero.
    let cancelled = false;
    void runLatencyTheater(
      steps,
      (p) => {
        if (!cancelled) setCompleted(p.completed);
      },
      totalMs,
    ).then(() => {
      if (!cancelled) onDoneRef.current();
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run-once: steps/totalMs are fixed for a mount.
  }, []);

  return (
    <div
      data-testid="latency-theater"
      className={`rounded-card border border-line bg-panel p-4 shadow-card ${className}`}
    >
      {title && <div className="mb-2 text-sm font-semibold text-ink">{title}</div>}
      <ul className="space-y-1.5 text-sm">
        {steps.map((step, i) => {
          const state = i < completed ? 'done' : i === completed ? 'active' : 'pending';
          return (
            <li key={step.label} className="flex items-center gap-2" data-state={state}>
              <span
                className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-bold ${
                  state === 'done'
                    ? 'bg-good-bg text-good'
                    : state === 'active'
                      ? 'animate-pulse bg-accent text-ink'
                      : 'bg-line-soft text-faint'
                }`}
              >
                {state === 'done' ? '✓' : '·'}
              </span>
              <span className={state === 'pending' ? 'text-faint' : 'text-body'}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
