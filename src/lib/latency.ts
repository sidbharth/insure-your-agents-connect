/**
 * Latency-theater runner (REQ-6.4): every simulated verification shows a
 * 1–2 s progress state with specific, believable sub-steps. Instant results
 * feel fake; long waits kill demos.
 *
 * `runLatencyTheater` drives the staged sub-steps and reports progress via a
 * callback; `LatencyTheater.tsx` renders it. Test mode (zero delays) is a
 * module-level switch so component tests never wait.
 */

export interface LatencyStep {
  /** e.g. "Fetching tool manifest…" */
  label: string;
  /** Optional explicit duration in ms; otherwise the total is split evenly. */
  durationMs?: number;
}

export interface LatencyProgress {
  stepIndex: number;
  step: LatencyStep;
  /** Steps completed so far (== stepIndex while running the step). */
  completed: number;
  total: number;
}

let zeroDelayMode = false;

/** Test hook: run all theater instantly. */
export function setLatencyTestMode(on: boolean): void {
  zeroDelayMode = on;
}


const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run the staged sub-steps, invoking `onProgress` as each step starts and
 * resolving after the last completes. Total defaults to 6.4 s split across
 * steps unless steps carry explicit durations — slow enough that each
 * sub-step label can actually be read.
 */
export async function runLatencyTheater(
  steps: LatencyStep[],
  onProgress?: (p: LatencyProgress) => void,
  totalMs = 6400,
): Promise<void> {
  if (steps.length === 0) return;
  const explicit = steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
  const unspecified = steps.filter((s) => s.durationMs == null).length;
  const evenShare = unspecified > 0 ? Math.max(0, totalMs - explicit) / unspecified : 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress?.({ stepIndex: i, step, completed: i, total: steps.length });
    if (!zeroDelayMode) {
      await sleep(step.durationMs ?? evenShare);
    }
  }
  onProgress?.({
    stepIndex: steps.length - 1,
    step: steps[steps.length - 1],
    completed: steps.length,
    total: steps.length,
  });
}
