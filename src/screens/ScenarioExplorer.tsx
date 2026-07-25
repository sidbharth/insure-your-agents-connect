/**
 * Scenario Explorer (screen 7.10, GT-4 as an interactive object). WP-4.
 *
 * A picker of the eight curated situations from src/data/scenarios.ts, each
 * answered with a decisive verdict card: the verdict, the coverage route,
 * ONE clause-level reason, and the control that made the difference
 * (REQ-7.10.2). At least two scenarios end in denial (REQ-7.10.1).
 *
 * Scenario 2 carries the "what if no attestation?" toggle AND reads the
 * actual target agent's attestation state at event time — flipping either
 * turns Covered(B) into Denied-as-unprovable (AC-3c). Reachable pre-purchase
 * from 7.6: cards show quote-stage numbers when no enrollment exists.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SCENARIOS, type ScenarioDef } from '../data/scenarios';
import { SEED_CAP_USD } from '../data/seed';
import { intervalCovers } from '../lib/conditions';
import { demoNow } from '../lib/demoClock';
import { useStore } from '../store';
import { newestMandate } from './portfolio/helpers';

export default function ScenarioExplorer() {
  const agents = useStore((s) => s.agents);
  const enrollments = useStore((s) => s.enrollments);
  const mandates = useStore((s) => s.mandates);
  useStore((s) => s.presenter.timeOffsetMs);

  const now = demoNow();
  const [selectedNum, setSelectedNum] = useState(2);
  const [noAttestationToggle, setNoAttestationToggle] = useState(false);

  // Scenario 2's target agent: default to the first enrolled agent (or the
  // wizard agent pre-purchase); the picker lets the presenter point the same
  // event at Legacy-Bot, whose real attestation state then drives the verdict.
  const liveEnrollments = enrollments.filter((e) => e.terminatedAt === undefined);
  const enrolledIds = new Set(liveEnrollments.map((e) => e.agentId));
  const candidates = agents.filter(
    (a) => enrolledIds.size === 0 || enrolledIds.has(a.id),
  );
  const [targetAgentId, setTargetAgentId] = useState<string | undefined>();
  const targetAgent =
    candidates.find((a) => a.id === targetAgentId) ?? candidates[0];

  const scenario = SCENARIOS.find((s) => s.num === selectedNum) as ScenarioDef;

  // The policy's real cap (quote-stage cap when nothing is enrolled).
  const capUsd = targetAgent
    ? (newestMandate(mandates[targetAgent.id])?.caps.perTx ?? SEED_CAP_USD)
    : SEED_CAP_USD;

  // AC-3c: the effective attestation state = the target agent's REAL
  // attestation-at-event-time (event = now for the explorer) AND the
  // counterfactual toggle.
  const agentAttested = targetAgent
    ? intervalCovers(targetAgent.controlsHistory.attestation, now)
    : true;
  const attested = agentAttested && !noAttestationToggle;

  const verdict = useMemo(
    () => scenario.verdict({ capUsd, attested }),
    [scenario, capUsd, attested],
  );

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-ScenarioExplorer">
      <Link
        to="/coverage"
        className="mb-3 inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
      >
        ← Back to coverage
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-lg">Scenario Explorer</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Eight reference scenarios with covered, partly covered, and denied
            outcomes. Each shows the determination, the coverage route, and the
            clause it rests on.
          </p>
        </div>
        <span className="self-center rounded-md border border-line bg-canvas px-2.5 py-1 text-2xs font-semibold tracking-wide text-faint">
          Framework scenario library (simulated)
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[430px_1fr]">
        {/* -- picker -------------------------------------------------------- */}
        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          {SCENARIOS.map((s) => {
            const active = s.num === selectedNum;
            return (
              <button
                key={s.num}
                data-testid={`scenario-item-${s.num}`}
                onClick={() => {
                  setSelectedNum(s.num);
                  setNoAttestationToggle(false);
                }}
                className={`flex w-full items-start gap-2.5 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 ${
                  active ? 'bg-canvas shadow-[inset_3px_0_0_#00c988]' : ''
                }`}
              >
                <span
                  className={`num mt-px flex h-5 w-5 flex-none items-center justify-center rounded-md text-2xs font-bold ${
                    active ? 'bg-ink text-white' : 'bg-line-soft text-muted'
                  }`}
                >
                  {s.num}
                </span>
                <span
                  className={`flex-1 text-xs leading-snug ${active ? 'font-semibold text-ink' : 'text-body'}`}
                >
                  {s.title}
                </span>
                <span
                  className={`rounded-md border px-1.5 py-px text-[10px] font-semibold ${
                    s.pickerVerdict === 'Covered'
                      ? 'border-good-line bg-good-bg text-good'
                      : 'border-bad-line bg-bad-bg text-bad'
                  }`}
                >
                  {s.pickerVerdict}
                </span>
              </button>
            );
          })}
        </div>

        {/* -- verdict panel -------------------------------------------------- */}
        <div>
          <div className="mb-3 rounded-card border border-line bg-panel px-4.5 py-3.5 p-4 shadow-card">
            <div className="text-2xs font-bold uppercase tracking-widest text-faint">
              Scenario {scenario.num}
              {scenario.attestationSensitive && noAttestationToggle && ' (counterfactual)'}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-body">
              {scenario.attestationSensitive && noAttestationToggle
                ? 'The same hidden-instructions attack, on an agent without TEE attestation (saving 0.6% on the premium).'
                : scenario.narrative}
            </p>
          </div>

          <div
            data-testid="scenario-verdict-card"
            data-covered={verdict.covered}
            className="overflow-hidden rounded-card border border-line bg-panel shadow-card"
          >
            <div
              className={`flex items-center gap-3 border-b px-5 py-4 ${
                verdict.covered
                  ? 'border-good-line bg-good-bg'
                  : 'border-bad-line bg-bad-bg'
              }`}
            >
              <span
                className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-md font-extrabold text-white ${
                  verdict.covered ? 'bg-good' : 'bg-bad'
                }`}
              >
                {verdict.covered ? '✓' : '×'}
              </span>
              <span
                data-testid="verdict-headline"
                className={`text-md font-bold tracking-tight ${verdict.covered ? 'text-good' : 'text-bad'}`}
              >
                {verdict.headline}
              </span>
              <span className="ml-auto rounded-md border border-line bg-panel px-2 py-px text-[10px] font-semibold tracking-wide text-faint">
                Simulated determination
              </span>
            </div>
            <div className="px-5 py-4">
              <div className="flex justify-between gap-4 text-sm">
                <span className="font-semibold text-muted">Coverage route</span>
                <b className="text-right text-ink" data-testid="verdict-route">
                  {verdict.routeLine}
                </b>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-2xs font-bold uppercase tracking-widest text-faint">
                  Basis for determination
                </div>
                <p className="mt-1 text-sm leading-relaxed text-body" data-testid="verdict-reason">
                  {verdict.reason}
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-xs text-muted">
                <b className="text-ink">Determining control:</b>{' '}
                <span data-testid="verdict-control">{verdict.control}</span>
              </div>

              {/* scenario 2: the attestation counterfactual (AC-3c) */}
              {scenario.attestationSensitive && (
                <div
                  data-testid="attestation-counterfactual"
                  className="mt-3.5 rounded-lg border border-dashed border-line bg-canvas px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <button
                      role="switch"
                      aria-checked={noAttestationToggle}
                      data-testid="no-attestation-toggle"
                      onClick={() => setNoAttestationToggle((v) => !v)}
                      className={`relative h-[17px] w-[30px] flex-none rounded-full transition-colors ${
                        noAttestationToggle ? 'bg-accent' : 'bg-line'
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white transition-all ${
                          noAttestationToggle ? 'left-[15px]' : 'left-[2px]'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-muted">
                      <b className="text-ink">What if no attestation?</b>{' '}
                      {noAttestationToggle
                        ? 'Enabled. The same event is evaluated without attested inputs, and the determination above changes accordingly.'
                        : 'Enable the toggle to evaluate the same event for an agent without TEE attestation.'}
                    </span>
                  </div>
                  {targetAgent && (
                    <div className="mt-2.5 flex items-center gap-2 border-t border-line-soft pt-2.5 text-2xs text-muted">
                      <label htmlFor="scenario-target-agent" className="flex-none">
                        Target agent
                      </label>
                      <select
                        id="scenario-target-agent"
                        data-testid="scenario-target-agent"
                        value={targetAgent.id}
                        onChange={(e) => {
                          setTargetAgentId(e.target.value);
                        }}
                        className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-2xs text-ink"
                      >
                        {candidates.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <span data-testid="agent-attestation-state">
                        {agentAttested ? (
                          <>attestation operative at event time</>
                        ) : (
                          <b className="text-bad">
                            no attestation operative at event time. The verdict
                            reflects this agent’s actual state.
                          </b>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
