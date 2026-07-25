/**
 * Presenter slice (plan §2/§10). WP-0 freezes the state shape
 * {panelOpen, armed, timeOffsetMs} and the action SIGNATURES; WP-5 owns the
 * full action implementations (incident builders, forced states, etc.).
 */
import type { StateCreator } from 'zustand';
import { landIncident } from '../data/incidents';
import type { PresenterSlice, RootState } from './types';

export const createPresenterSlice: StateCreator<RootState, [], [], PresenterSlice> = (
  set,
  get,
) => ({
  presenter: {
    panelOpen: false,
    armed: false,
    timeOffsetMs: 0,
  },

  setPanelOpen: (open) =>
    set((s) => ({ presenter: { ...s.presenter, panelOpen: open } })),

  setArmed: (armed) =>
    set((s) => ({ presenter: { ...s.presenter, armed } })),

  advanceTime: (byMs) =>
    set((s) => ({
      presenter: { ...s.presenter, timeOffsetMs: s.presenter.timeOffsetMs + byMs },
    })),

  /**
   * Inject a scenario against a target agent (plan §7.12, REQ-7.12.1).
   * The incident build + landing (narrative, demo-clock timestamps,
   * containment record, mock artifacts, S-17 near-miss extras) is shared with
   * the self-serve claim demo via landIncident; arming the dashboard
   * "Simulate incident" affordance stays presenter-only, here.
   */
  injectIncident: (scenarioId, agentId, lossUsd) => {
    const incident = landIncident(get(), scenarioId, agentId, lossUsd);
    if (incident === undefined) return;
    set((s) => ({ presenter: { ...s.presenter, armed: true } }));
  },
});
