/**
 * Programme dashboard: the underwriting-side portfolio view. Accumulation
 * registers (framework Appendix 1), programme totals, and the published rate
 * schedule live here so the customer-facing purchase and policy screens stay
 * free of insurer-side bookkeeping (5.8.2).
 */
import { ConcentrationMeter } from '../components/ConcentrationMeter';
import { TIER2_COPY } from '../data/copy';
import { HELIOS } from '../data/seed';
import { currentShare } from '../lib/concentration';
import { formatUsd } from '../lib/money';
import { useStore } from '../store';

export default function ProgrammeDashboard() {
  const book = useStore((s) => s.book);
  const enrollments = useStore((s) => s.enrollments);
  useStore((s) => s.presenter.timeOffsetMs);

  const totalExternal = book.components.reduce((a, c) => a + c.externalCapsUsd, 0);
  const totalEnrolled = Object.values(book.enrolledCapsUsd).reduce(
    (a, v) => a + v,
    0,
  );
  const totalCaps = totalExternal + totalEnrolled;
  const liveEnrollments = enrollments.filter((e) => e.terminatedAt === undefined);

  const componentKeys = [
    ...book.components.map((c) => c.harness),
    ...Object.keys(book.enrolledCapsUsd).filter(
      (k) => !book.components.some((c) => c.harness === k),
    ),
  ];
  const registers = componentKeys.map((key) => {
    const external =
      book.components.find((c) => c.harness === key)?.externalCapsUsd ?? 0;
    const enrolled = book.enrolledCapsUsd[key] ?? 0;
    return {
      key,
      capsUsd: external + enrolled,
      enrolledUsd: enrolled,
      share: currentShare(book, key),
    };
  });

  return (
    <div className="mx-auto max-w-shell px-6 py-8" data-testid="screen-ProgrammeDashboard">
      <h1 className="text-lg">Programme dashboard</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        The portfolio view maintained by the underwriting side. These figures
        do not change how you use your policies. They are shown for
        transparency into how the programme monitors and prices shared risk.
      </p>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
        {/* Accumulation registers (framework Appendix 1) */}
        <section
          className="rounded-card border border-line bg-panel shadow-card"
          data-testid="accumulation-registers"
        >
          <div className="border-b border-line-soft px-5 py-3.5">
            <h2 className="text-md">Accumulation registers</h2>
            <p className="mt-0.5 text-xs text-muted">
              Shared components across all policies in the programme book.
              Concentration in any one component is priced, not forbidden.
            </p>
          </div>
          <div className="px-5 py-4">
            <ConcentrationMeter
              component={HELIOS}
              share={currentShare(book, HELIOS)}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-2xs font-bold uppercase tracking-wider text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-3">Component</th>
                    <th className="py-1.5 pr-3 text-right">Insured caps</th>
                    <th className="py-1.5 pr-3 text-right">From this operator</th>
                    <th className="py-1.5 text-right">Share of book</th>
                  </tr>
                </thead>
                <tbody>
                  {registers.map((r) => (
                    <tr key={r.key} className="border-b border-line-soft last:border-b-0">
                      <td className="py-2 pr-3 font-semibold text-ink">{r.key}</td>
                      <td className="num py-2 pr-3 text-right">{formatUsd(r.capsUsd)}</td>
                      <td className="num py-2 pr-3 text-right">
                        {r.enrolledUsd > 0 ? formatUsd(r.enrolledUsd) : '—'}
                      </td>
                      <td className="num py-2 text-right font-semibold text-ink">
                        {(r.share * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-body">
              Agents enrolled before a threshold crossing keep their rate. The
              loading is frozen into each enrollment when it is made and never
              changes retroactively.
            </p>
          </div>
        </section>

        {/* Programme summary + published schedule */}
        <div className="flex flex-col gap-4">
          <section
            className="rounded-card border border-line bg-panel p-5 shadow-card"
            data-testid="programme-book-summary"
          >
            <h2 className="text-md">Programme book</h2>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Total insured caps</dt>
                <dd className="num font-semibold text-ink">{formatUsd(totalCaps)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">External to this operator</dt>
                <dd className="num text-ink">{formatUsd(totalExternal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Enrolled by this operator</dt>
                <dd className="num text-ink">{formatUsd(totalEnrolled)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line-soft pt-1.5">
                <dt className="text-muted">Live enrollments (this operator)</dt>
                <dd className="num font-semibold text-ink">{liveEnrollments.length}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line-soft pt-2.5 text-xs text-body">
              The claims fund is seeded by the programme treasury and grows
              with premiums. Claims are paid from this fund.
            </p>
          </section>

          <section
            className="rounded-card border border-line bg-panel p-5 shadow-card"
            data-testid="rate-schedule"
          >
            <h2 className="text-md">Published rate schedule</h2>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Base rate (fully compliant)</dt>
                <dd className="num font-semibold text-ink">0.6% of cap</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Ceiling</dt>
                <dd className="num font-semibold text-ink">3.0% of cap</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Missing any tier-1 control</dt>
                <dd className="font-semibold text-bad">Declined</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-line-soft pt-2.5">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-muted">
                Surcharges for skipped controls
              </h3>
              <ul className="mt-1.5 space-y-2">
                {TIER2_COPY.map((c) => (
                  <li key={c.key} className="text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-ink">{c.label}</span>
                      <span className="num font-semibold text-warn">{c.surcharge}</span>
                    </div>
                    <p className="mt-0.5 text-muted">{c.insurersWhy}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
