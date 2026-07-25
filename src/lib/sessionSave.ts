/**
 * Local session persistence (no backend): a manual "Save session" snapshot
 * of the serializable data slices into localStorage, restored on boot by
 * main.tsx. Transient slices (price feed, presenter panel, clock offset)
 * are never saved — they re-derive on load. reset() clears the snapshot.
 */
import type { RootState } from '../store/types';

const KEY = 'insure-your-agents:session:v1';

const DATA_KEYS = [
  'operator',
  'agents',
  'mandates',
  'pendingEdits',
  'enrollments',
  'book',
  'nearMisses',
  'incidents',
  'claims',
  'showMath',
  'role',
] as const;

type DataKey = (typeof DATA_KEYS)[number];
export type SavedData = Pick<RootState, DataKey>;

export interface SavedSession {
  savedAt: number;
  wizardAgentId: string;
  data: SavedData;
}

export function saveSession(state: RootState, wizardAgentId: string): boolean {
  try {
    const data = Object.fromEntries(
      DATA_KEYS.map((k) => [k, state[k]]),
    ) as unknown as SavedData;
    localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: Date.now(), wizardAgentId, data }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('data' in parsed) ||
      !('wizardAgentId' in parsed)
    ) {
      return null;
    }
    return parsed as SavedSession;
  } catch {
    return null;
  }
}

export function clearSavedSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
