import { isSyncPeerRoundRetryableError } from '../../../../../lib/core/sync/runSyncPeerRound';
import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { completeCompanionSyncGroupAdoption } from './completeCompanionSyncGroupAdoption';
import { publishCompanionSyncMutationRevision } from './mutation/companionSyncMutationRevision';

type ActiveAdoptionRun = { phase: 'receiving' | 'paused' | 'failed'; completed: number; total: number | null;
  lastActivityAt: string | null; error: string | null };
export type CompanionSyncGroupAdoptionRun = { phase: 'none' } | ActiveAdoptionRun;

let current: CompanionSyncGroupAdoptionRun = { phase: 'none' };
let running: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function publish(next: CompanionSyncGroupAdoptionRun) {
  current = next;
  listeners.forEach(listener => listener());
}

function active(phase: ActiveAdoptionRun['phase'], patch: Partial<Omit<ActiveAdoptionRun, 'phase'>> = {}) {
  const previous = current.phase === 'none'
    ? { completed: 0, total: null, lastActivityAt: null, error: null }
    : current;
  publish({ completed: previous.completed, total: previous.total, lastActivityAt: previous.lastActivityAt,
    error: null, ...patch, phase });
}

export function readCompanionSyncGroupAdoptionRun() {
  return current;
}

export function subscribeCompanionSyncGroupAdoptionRun(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasPendingCompanionSyncGroupAdoption() {
  return current.phase !== 'none';
}

/** Reads the durable adoption record, which stays the only truth across interruptions and restarts. */
export async function hydrateCompanionSyncGroupAdoptionRun() {
  const adoption = await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption);
  if (!adoption) {
    if (!running) publish({ phase: 'none' });
    return false;
  }
  if (current.phase === 'none') active('receiving');
  return true;
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Continues a pending adoption; concurrent callers share one run. Resolves true when it finished. */
export function runPendingCompanionSyncGroupAdoption() {
  running ??= (async () => {
    if (!await hydrateCompanionSyncGroupAdoptionRun()) return false;
    active('receiving');
    try {
      await completeCompanionSyncGroupAdoption({ onProgress: progress => {
        if (progress.phase !== 'structure' || progress.total === null) return;
        active('receiving', { completed: progress.completed, total: progress.total,
          lastActivityAt: new Date().toISOString() });
      } });
    } catch (error) {
      const code = errorCode(error);
      // Backgrounding pauses; a busy or expired provider round is retried by the scheduler while visible.
      const phase = code.includes('request_sync_foreground_ended') ? 'paused'
        : isSyncPeerRoundRetryableError(error) ? 'receiving' : 'failed';
      active(phase, { error: code });
      throw error;
    }
    publish({ phase: 'none' });
    publishCompanionSyncMutationRevision({ kind: 'full' });
    return true;
  })().finally(() => { running = null; });
  return running;
}
