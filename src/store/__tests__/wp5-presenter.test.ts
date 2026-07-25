/**
 * WP-5 store tests — presenter injection + claims data (screens 7.11–7.12):
 *  - injectIncident builds the full incident, arms the presenter, and (S-17)
 *    lands a near-miss feed entry + renewal data credit (AC-11 wiring).
 *  - AC-9: every scenario auto-attaches exactly 6 applicable items; zero
 *    fabricated artifacts for notApplicable items; notApplicable never gates
 *    package completeness.
 *  - REQ-7.11.3: the payout recomputes from a presenter-edited loss.
 *  - AC-13: revoke → inject → not payable (condition precedent at event
 *    time); restore → inject again → the new claim proceeds.
 *  - Fast-forward advances claim phases as real state (§5c).
 *  - AC-16: presenter reset restores the seed incl. `pinned: false`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAdjudicationInput,
  buildEvidenceChecklist,
  EVIDENCE_MATRIX,
  packageComplete,
  resetIncidentCounter,
  SCENARIO_IDS,
} from '../../data/incidents';
import { WIZARD_AGENT } from '../../data/seed';
import { testEnrollment, testMandate } from '../../lib/__tests__/fixtures';
import { adjudicate } from '../../lib/claims';
import { advance, DAY_MS, phaseFromAnchors } from '../../lib/clocks';
import { demoNow } from '../../lib/demoClock';
import { getWizardAgentId, setWizardAgentId } from '../../screens/wizard/wizardAgent';
import { useStore } from '..';
import { setPriceFetchFn } from '../priceFeed';
import type { Incident } from '../types';

beforeEach(() => {
  setPriceFetchFn(async () => 3.0);
  useStore.getState().reset();
  resetIncidentCounter();
});

/** Enroll the agent with an in-force mandate (seed enrollments are empty). */
function enroll(agentId = 'procurement-bot'): void {
  const s = useStore.getState();
  s.saveMandate(agentId, testMandate());
  s.addEnrollment(testEnrollment({ agentId }));
  s.pinPrice(); // deterministic $3.00 for payout arithmetic
}

function adjudicateIncident(incident: Incident) {
  const s = useStore.getState();
  return adjudicate(
    buildAdjudicationInput(
      {
        agents: s.agents,
        mandates: s.mandates,
        enrollments: s.enrollments,
        operator: s.operator,
      },
      incident,
      s.priceFeed.usdPerN,
    ),
  );
}

describe('injectIncident (REQ-7.12.1)', () => {
  it('adds the incident and arms the presenter', () => {
    useStore.getState().injectIncident('S-09', 'procurement-bot');
    const s = useStore.getState();
    expect(s.incidents).toHaveLength(1);
    expect(s.incidents[0].scenarioId).toBe('S-09');
    expect(s.incidents[0].agentId).toBe('procurement-bot');
    expect(s.incidents[0].lossGrossUsd).toBe(20_000); // scenario default
    expect(s.presenter.armed).toBe(true);
  });

  it('is a silent no-op for an unknown agent', () => {
    useStore.getState().injectIncident('S-09', 'no-such-agent');
    expect(useStore.getState().incidents).toHaveLength(0);
    expect(useStore.getState().presenter.armed).toBe(false);
  });

  it('S-17 additionally lands a near-miss entry and a renewal data credit', () => {
    enroll();
    useStore.getState().injectIncident('S-17', 'procurement-bot');
    const s = useStore.getState();
    expect(s.nearMisses).toHaveLength(1);
    expect(s.nearMisses[0].type).toBe('blocked-injection');
    expect(s.nearMisses[0].creditPoints).toBe(0.01);
    const enrollment = s.enrollments.find((e) => e.agentId === 'procurement-bot');
    expect(enrollment?.credits).toHaveLength(1);
    expect(enrollment?.credits[0]).toMatchObject({ type: 'near-miss', points: 0.01 });
  });
});

describe('evidence applicability matrix (AC-9)', () => {
  it('every scenario auto-attaches exactly 6 applicable items', () => {
    for (const id of SCENARIO_IDS) {
      const checklist = buildEvidenceChecklist(id);
      expect(checklist).toHaveLength(12);
      const auto = checklist.filter((e) => e.status === 'auto');
      expect(auto, id).toHaveLength(6);
      expect(EVIDENCE_MATRIX[id].auto).toHaveLength(6);
    }
  });

  it('injects zero fabricated artifacts for notApplicable items', () => {
    for (const scenarioId of SCENARIO_IDS) {
      useStore.getState().injectIncident(scenarioId, 'procurement-bot');
      const incident = useStore.getState().incidents.at(-1)!;
      const matrix = EVIDENCE_MATRIX[scenarioId];
      for (const naId of matrix.notApplicable) {
        expect(incident.artifacts[naId], `${scenarioId} item ${naId}`).toBeUndefined();
      }
      for (const appId of [...matrix.auto, ...matrix.upload]) {
        expect(incident.artifacts[appId], `${scenarioId} item ${appId}`).toBeDefined();
      }
    }
  });

  it('notApplicable items never gate package completeness', () => {
    for (const id of SCENARIO_IDS) {
      const checklist = buildEvidenceChecklist(id);
      expect(packageComplete(checklist)).toBe(false); // uploadables missing
      const allAttached = checklist.map((e) =>
        e.status === 'missing' ? { ...e, status: 'uploaded' as const } : e,
      );
      // Complete even though notApplicable rows remain untouched.
      expect(allAttached.some((e) => e.status === 'notApplicable')).toBe(true);
      expect(packageComplete(allAttached)).toBe(true);
    }
  });
});

describe('payout recomputes from injected parameters (REQ-7.11.3)', () => {
  it('a presenter-edited loss flows through the whole pipeline', () => {
    enroll();
    useStore.getState().injectIncident('S-09', 'procurement-bot', 40_000);
    const incident = useStore.getState().incidents[0];
    expect(incident.lossGrossUsd).toBe(40_000);
    const result = adjudicateIncident(incident);
    expect(result.eligibility.covered).toBe(true);
    // 40,000 − retention max(500 × $3.00, 2% × 40,000) = 40,000 − 1,500.
    expect(result.math?.retentionUsd).toBe(1_500);
    expect(result.math?.payoutUsd).toBe(38_500);
  });

  it('the default S-09 loss pays $18,500 at $3.00', () => {
    enroll();
    useStore.getState().injectIncident('S-09', 'procurement-bot');
    const result = adjudicateIncident(useStore.getState().incidents[0]);
    expect(result.math?.payoutUsd).toBe(18_500);
  });
});

describe('verification revoke/restore around injection (AC-13)', () => {
  it('revoke → inject → not payable; restore → inject again → proceeds', () => {
    enroll();
    const s = useStore.getState();

    s.revokeVerification();
    // Separate interval boundaries on the demo clock so an event never lands
    // on the same millisecond as a later restore ([from, to) semantics).
    s.advanceTime(1_000);
    s.injectIncident('S-09', 'procurement-bot');
    const denied = adjudicateIncident(useStore.getState().incidents[0]);
    expect(denied.conditionsPrecedent.pass).toBe(false);
    expect(denied.conditionsPrecedent.failedCondition).toBe(
      'verification not current at event time',
    );
    expect(denied.eligibility.covered).toBe(false);

    useStore.getState().advanceTime(1_000);
    useStore.getState().verifyOperator();
    useStore.getState().injectIncident('S-09', 'procurement-bot');
    const second = useStore.getState().incidents[1];
    const covered = adjudicateIncident(second);
    expect(covered.conditionsPrecedent.pass).toBe(true);
    expect(covered.eligibility.covered).toBe(true);

    // The earlier event stays denied — interval histories, not booleans.
    const stillDenied = adjudicateIncident(useStore.getState().incidents[0]);
    expect(stillDenied.conditionsPrecedent.pass).toBe(false);
  });
});

describe('fast-forward advances claim phases (§5c)', () => {
  it('insurer anchors auto-fill as their windows elapse', () => {
    enroll();
    const s = useStore.getState();
    s.injectIncident('S-09', 'procurement-bot');
    const incident = useStore.getState().incidents[0];
    const claimId = useStore.getState().openClaim(incident.id);
    useStore
      .getState()
      .updateClaim(claimId, { evidence: buildEvidenceChecklist('S-09') });

    // Notify now, then jump 7 days: the 2-business-day ack window elapses.
    const claim = () => useStore.getState().claims.find((c) => c.id === claimId)!;
    const anchors = { ...claim().clockState.anchors, notifiedAt: demoNow() };
    const notified = { ...claim().clockState, anchors };
    useStore
      .getState()
      .setClockState(claimId, { ...notified, phase: phaseFromAnchors(notified) });
    expect(claim().clockState.phase).toBe('Notified');
    expect(claim().clockState.anchors.acknowledgedAt).toBeUndefined();

    useStore.getState().advanceTime(7 * DAY_MS);
    useStore
      .getState()
      .setClockState(claimId, advance(claim().clockState, demoNow()));
    expect(claim().clockState.anchors.acknowledgedAt).toBeDefined();
    expect(claim().clockState.phase).toBe('Acknowledged');
    // Determination never runs without a complete package (§5c).
    expect(claim().clockState.anchors.determinedAt).toBeUndefined();
  });
});

describe('presenter reset (AC-16)', () => {
  it('restores the seed incl. pinned: false from a broadly mutated state', () => {
    enroll();
    const s = useStore.getState();
    expect(s.priceFeed.pinned).toBe(true); // enroll() pinned it
    s.injectIncident('S-18', 'procurement-bot');
    s.openClaim(useStore.getState().incidents[0].id);
    s.advanceTime(30 * DAY_MS);
    s.revokeVerification();

    useStore.getState().reset();

    const after = useStore.getState();
    expect(after.priceFeed.pinned).toBe(false); // the seeded setting
    expect(after.incidents).toHaveLength(0);
    expect(after.claims).toHaveLength(0);
    expect(after.enrollments).toHaveLength(0);
    expect(after.presenter).toEqual({ panelOpen: false, armed: false, timeOffsetMs: 0 });
    expect(
      after.operator.verificationHistory.some((iv) => iv.verified && iv.to === undefined),
    ).toBe(true);
  });

  it('resets the wizard-local current agent back to the seeded default', () => {
    setWizardAgentId('legacy-bot');
    useStore.getState().reset();
    expect(getWizardAgentId()).toBe(WIZARD_AGENT.id);
  });
});
