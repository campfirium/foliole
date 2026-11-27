import { FramedSyncSessionExpiredError } from '../../../../../lib/core/sync/framedSyncHttpContract.js';
import { isSyncPeerRoundRetryableError } from '../../../../../lib/core/sync/runSyncPeerRound';
import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { holdCompanionSyncBackgroundWork } from '../runtime/companionSyncBackgroundWork';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { publishCompanionSyncMembershipChanged } from './companionSyncApplied';
import { describeCompanionSyncReceiveIssue, isCompanionSyncPeerUnreachable, redactedCompanionSyncErrorDetail,
  type CompanionSyncReceiveIssue } from './companionSyncReceiveIssue';
import { completeCompanionSyncGroupAdoption } from './completeCompanionSyncGroupAdoption';
import { leaveCompanionSyncGroupDevice } from './syncGroupStore';

type ActiveAdoptionRun = { phase: 'receiving' | 'paused' | 'failed'; completed: number; total: number | null;
  lastActivityAt: string | null; error: string | null; errorDetail?: string | undefined;
  rejection?: CompanionSyncReceiveIssue | undefined; providerName?: string | undefined };
export type CompanionSyncGroupAdoptionRun = { phase: 'none' } | ActiveAdoptionRun;

let current: CompanionSyncGroupAdoptionRun = { phase: 'none' };
let running: Promise<boolean> | null = null;
let leaving: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CompanionSyncGroupAdoptionRun) {
  current = next;
  listeners.forEach(listener => listener());
}

function active(phase: ActiveAdoptionRun['phase'], patch: Partial<Omit<ActiveAdoptionRun, 'phase'>> = {}) {
  const previous = current.phase === 'none' ? { completed: 0, total: null, lastActivityAt: null } : current;
  publish({ ...previous, error: null, errorDetail: undefined, ...patch, phase });
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
  if (current.phase === 'none') active('receiving', { providerName: adoption.providerDeviceName });
  return true;
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Continues a pending adoption; concurrent callers share one run. Resolves true when it finished. */
export function runPendingCompanionSyncGroupAdoption() {
  if (leaving) return leaving.then(() => false);
  running ??= (async () => {
    if (!await hydrateCompanionSyncGroupAdoptionRun()) return false;
    active('receiving', { error: current.phase === 'receiving' ? current.error : null });
    // Receiving a whole library is the long round people leave the app during.
    const work = holdCompanionSyncBackgroundWork();
    let rejection: CompanionSyncReceiveIssue | undefined;
    try {
      await completeCompanionSyncGroupAdoption({ onObjectRejection: issue => {
        if (!rejection || issue.code === 'request_sync_body_too_large') rejection = issue;
        active('receiving', { rejection });
      }, onProgress: progress => {
        if (progress.phase !== 'structure' || progress.total === null) return;
        active('receiving', { completed: progress.completed, total: progress.total,
          lastActivityAt: new Date().toISOString() });
        work.report(progress.completed, progress.total);
      } });
      if (await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption)) {
        active('receiving', { rejection });
        return false;
      }
    } catch (error) {
      if (error instanceof FramedSyncSessionExpiredError) {
        active('receiving', { rejection });
        return false;
      }
      const code = errorCode(error);
      // Backgrounding pauses; a busy, expired or unreachable provider is retried by the scheduler while visible.
      const phase = code.includes('request_sync_foreground_ended') ? 'paused'
        
        : isSyncPeerRoundRetryableError(error) || isCompanionSyncPeerUnreachable(error) ? 'receiving' : 'failed';
      const shown = describeCompanionSyncReceiveIssue(error).code;
      active(phase, { error: shown,
        errorDetail: shown === 'sync_receive_failed' ? redactedCompanionSyncErrorDetail(error) : undefined });
      throw error;
    } finally {
      work.release();
    }
    publish({ phase: 'none' });
    publishCompanionSyncMembershipChanged();
    return true;
  })().finally(() => { running = null; });
  return running;
}

export async function leaveCompanionSyncGroupAfterAdoptionStops() {
  if (running) throw new Error('sync_group_local_adoption_running');
  leaving ??= leaveCompanionSyncGroupDevice().then(() => publish({ phase: 'none' }))
    .finally(() => { leaving = null; });
  return leaving;
}
