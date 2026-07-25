/**
 * App shell smoke tests (plan §10 WP-0 exit criteria):
 * the shell renders (header, nav, price chip) and every route resolves to
 * its placeholder screen. Also covers the presenter chord and reset button.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../App';
import { useStore } from '../store';
import { setPriceFetchFn } from '../store/priceFeed';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  setPriceFetchFn(undefined);
});

describe('app shell', () => {
  it('renders the header, nav, ShowMath toggle and price chip', () => {
    renderAt('/');
    expect(screen.getByText('AgentConnect Insurance')).toBeInTheDocument();
    expect(screen.getByTestId('main-nav')).toBeInTheDocument();
    expect(screen.getByText('My policies')).toBeInTheDocument();
    expect(screen.getByText('Fleet')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByTestId('show-math-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('price-chip')).toBeInTheDocument();
  });

  const ROUTES: [string, string][] = [
    ['/', 'screen-GetStarted'],
    ['/verify', 'screen-VerifyCompany'],
    ['/connect', 'screen-ConnectAgent'],
    ['/mandate', 'screen-Mandate'],
    ['/controls', 'screen-Controls'],
    ['/quote', 'screen-Quote'],
    ['/fleet', 'screen-Fleet'],
    ['/pay', 'screen-Pay'],
    ['/policies', 'screen-Policies'],
    ['/coverage', 'screen-Coverage'],
    ['/claim', 'screen-Claim'],
    ['/claim/claim-1', 'screen-Claim'],
  ];

  it.each(ROUTES)('route %s resolves to %s', (path, testId) => {
    renderAt(path);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('the Shift+D x3 chord toggles the presenter panel', () => {
    renderAt('/');
    expect(useStore.getState().presenter.panelOpen).toBe(false);
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    }
    expect(useStore.getState().presenter.panelOpen).toBe(true);
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    }
    expect(useStore.getState().presenter.panelOpen).toBe(false);
  });

  it('the presenter panel Reset to seed button calls reset()', () => {
    useStore.getState().setPanelOpen(true);
    useStore.getState().renameOperator('Mutated Corp');
    renderAt('/');
    fireEvent.click(screen.getByTestId('presenter-reset'));
    expect(useStore.getState().operator.name).toBe('NEAR Foundation');
    expect(useStore.getState().presenter.panelOpen).toBe(false);
  });
});
