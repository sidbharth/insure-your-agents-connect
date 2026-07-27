/**
 * Connect-flow state (this variant's purchase flow).
 *
 * Module-level like wizardAgent.ts: the frozen store contracts carry no
 * "current flow" fields, and the flow is a single browser session anyway.
 * Durable results (enrollments, activation) land in the real store through
 * the same machinery the original wizard used.
 */

export type FlowPaymentMethod = 'upfront' | 'stake';

/** The five connectable agents, in modal order. Handles are the seed names. */
export const CONNECTABLE_AGENT_IDS: readonly string[] = [
  'procurement-bot',
  'payables-bot',
  'treasury-bot',
  'refunds-bot',
  'legacy-bot',
];

let selectedAgentIds: string[] = [];
let paymentMethod: FlowPaymentMethod | undefined;
/** Highest coverage page (1..6) the user has agreed to. */
let agreedPages = 0;
/** The signature was recorded; unlocks the payment page. */
let signed = false;

export function getSelectedAgentIds(): string[] {
  return selectedAgentIds;
}

export function setSelectedAgentIds(ids: string[]): void {
  selectedAgentIds = [...ids];
}

export function getPaymentMethod(): FlowPaymentMethod | undefined {
  return paymentMethod;
}

export function setPaymentMethod(method: FlowPaymentMethod): void {
  paymentMethod = method;
}

export function getAgreedPages(): number {
  return agreedPages;
}

export function markPageAgreed(page: number): void {
  agreedPages = Math.max(agreedPages, page);
}

export function isSigned(): boolean {
  return signed;
}

export function markSigned(): void {
  signed = true;
}

/** Back to a fresh flow (landing mount and tests). */
export function resetFlowState(): void {
  selectedAgentIds = [];
  paymentMethod = undefined;
  agreedPages = 0;
  signed = false;
}
