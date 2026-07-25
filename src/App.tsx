/**
 * App shell (WP-0 owned): router + layout (header nav, ShowMathToggle,
 * PriceChip, UnverifiedBanner slot) + the presenter chord listener
 * (Shift+D ×3 within ~1.5 s) and the ?presenter=1 URL flag. Routes are
 * registered up front against placeholder screens; screen WPs replace only
 * their own screens/* files (plan §10 single-file ownership).
 */
import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { PriceChip } from './components/PriceChip';
import { ShowMathToggle } from './components/ShowMathToggle';
import { UnverifiedBanner } from './components/UnverifiedBanner';
import { RESET_FOOTNOTE } from './data/copy';
import { saveSession } from './lib/sessionSave';
import { getWizardAgentId } from './screens/wizard/wizardAgent';
import { useStore } from './store';
import Claim from './screens/Claim';
import ClaimDemo from './screens/ClaimDemo';
import ConnectAgent from './screens/ConnectAgent';
import Controls from './screens/Controls';
import Coverage from './screens/Coverage';
import Fleet from './screens/Fleet';
import GetStarted from './screens/GetStarted';
import Mandate from './screens/Mandate';
import Pay from './screens/Pay';
import Policies from './screens/Policies';
import PrincipalReview from './screens/PrincipalReview';
import ProgrammeDashboard from './screens/ProgrammeDashboard';
import PresenterPanel from './screens/PresenterPanel';
import Quote from './screens/Quote';
import VerifyCompany from './screens/VerifyCompany';

/** Chord window: three Shift+D presses within ~1.5 s toggle the panel. */
const CHORD_WINDOW_MS = 1500;
const CHORD_COUNT = 3;

function PresenterChordListener() {
  const presses = useRef<number[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey || (e.key !== 'D' && e.key !== 'd')) return;
      const now = performance.now();
      presses.current = presses.current
        .filter((t) => now - t < CHORD_WINDOW_MS)
        .concat(now);
      if (presses.current.length >= CHORD_COUNT) {
        presses.current = [];
        const s = useStore.getState();
        s.setPanelOpen(!s.presenter.panelOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/** ?presenter=1 opens the panel — the URL flag alternative to the chord. */
function PresenterUrlFlag() {
  const [params] = useSearchParams();
  const flag = params.get('presenter');
  useEffect(() => {
    if (flag === '1') useStore.getState().setPanelOpen(true);
  }, [flag]);
  return null;
}

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: '/policies', label: 'My policies' },
  { to: '/fleet', label: 'Fleet' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/claim', label: 'Claims' },
  { to: '/dashboard', label: 'Programme' },
];

function Header() {
  const operatorName = useStore((s) => s.operator.name);
  const initials = operatorName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <header className="flex min-h-[54px] flex-wrap items-center gap-x-6 gap-y-2 bg-ink px-4 py-2 text-white sm:px-7">
      <Link to="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-white">
        <img src="/near-symbol.svg" alt="NEAR" className="h-5 w-5" />
        AgentConnect Insurance
      </Link>
      <nav className="flex gap-0.5 text-sm" data-testid="main-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 ${
                isActive ? 'bg-[#2c2f2e] font-semibold text-white' : 'text-[#a8b0ad]'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <SaveSessionButton />
          <ResetSessionButton />
        </div>
        <ShowMathToggle className="hidden md:flex" />
        <span className="hidden h-[22px] w-px bg-white/15 md:block" />
        <PriceChip className="hidden lg:inline-flex" />
        <span
          title={operatorName}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#3a3f3d] text-[10px] font-bold text-[#cdd4d0]"
        >
          {initials}
        </span>
      </div>
    </header>
  );
}

/** Manual save-to-browser: snapshots the session into localStorage. */
function SaveSessionButton() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      data-testid="save-session"
      onClick={() => {
        const ok = saveSession(useStore.getState(), getWizardAgentId());
        if (ok) {
          setSaved(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setSaved(false), 2000);
        }
      }}
      className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${
        saved
          ? 'border-[#00EC97]/40 bg-[#00EC97]/10 text-[#00EC97]'
          : 'border-white/20 text-[#c6ccc8] hover:text-white'
      }`}
    >
      {saved ? 'Saved ✓' : 'Save session'}
    </button>
  );
}

/**
 * Reset the session: confirms, then restores the seed state and clears any
 * saved snapshot (store.reset() handles both).
 */
function ResetSessionButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid="reset-session"
      onClick={() => {
        const ok = window.confirm(
          'Reset this session? All agents, policies, claims, and any saved snapshot will be replaced with the sample data. This cannot be undone.',
        );
        if (!ok) return;
        useStore.getState().reset();
        navigate('/');
      }}
      className="whitespace-nowrap rounded-md border border-white/20 px-2.5 py-1 text-xs font-semibold text-[#c6ccc8] hover:border-[#e07a6a]/60 hover:text-[#f0a89d]"
    >
      Reset
    </button>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-shell px-6 pb-8 pt-10 text-2xs text-faint">
      <p>{RESET_FOOTNOTE}</p>
    </footer>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PresenterChordListener />
      <PresenterUrlFlag />
      <Header />
      <UnverifiedBanner />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<GetStarted />} />
          <Route path="/verify" element={<VerifyCompany />} />
          <Route path="/review" element={<PrincipalReview />} />
          <Route path="/connect" element={<ConnectAgent />} />
          <Route path="/mandate" element={<Mandate />} />
          <Route path="/controls" element={<Controls />} />
          <Route path="/quote" element={<Quote />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/dashboard" element={<ProgrammeDashboard />} />
          <Route path="/coverage" element={<Coverage />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/claim/demo" element={<ClaimDemo />} />
          <Route path="/claim/demo/:incidentId" element={<ClaimDemo />} />
          <Route path="/claim/:claimId" element={<Claim />} />
        </Routes>
      </main>
      <Footer />
      <PresenterPanel />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
