/**
 * WP-2 wizard-local state: which agent the purchase wizard is working on.
 * The frozen store contracts carry no "current wizard agent" field, so this
 * tiny module owns it (plan §10 — work around gaps inside WP-2 files).
 * Module state resets on refresh, matching the demo's reset-on-refresh rule.
 */
import { WIZARD_AGENT } from '../../data/seed';

let currentAgentId: string = WIZARD_AGENT.id;

export function getWizardAgentId(): string {
  return currentAgentId;
}

export function setWizardAgentId(id: string): void {
  currentAgentId = id;
}

/** Test/reset hook: back to the seeded default (Procurement-Bot). */
export function resetWizardAgentId(): void {
  currentAgentId = WIZARD_AGENT.id;
}
