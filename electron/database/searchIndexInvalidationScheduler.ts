import { setSearchIndexInvalidationScheduler } from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { submitDesktopOperation } from '../desktopOperations.js';
import type { DesktopTaskHandle } from '../desktopTaskTypes.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { notifyCurrentSearchIndexStatus } from '../ipc/searchIndexRebuild.js';
import { runWorkspaceSearchMaintenanceInWorker } from '../ipc/searchIndexRebuildWorkerClient.js';

import { runWithDatabaseConnectionOwner } from './connection.js';

const BATCH_LIMIT = 500;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 1000;

let active: DesktopTaskHandle | null = null;
let requested = false;
let stopped = true;

function notifyStatusWhenConnectionAvailable() {
  void runWithDatabaseConnectionOwner(notifyCurrentSearchIndexStatus).catch((error) => {
    appendMainProcessDiagnosticLog('search_index_status_notification_failed', { error });
  });
}

export function startSearchIndexInvalidationScheduler() {
  stopped = false;
  setSearchIndexInvalidationScheduler(scheduleSearchIndexInvalidationProcessing);
  scheduleSearchIndexInvalidationProcessing();
}

export function stopSearchIndexInvalidationScheduler() {
  stopped = true;
  requested = false;
  setSearchIndexInvalidationScheduler(null);
  active?.cancel();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelayMs = 1000;
}

function scheduleSearchIndexInvalidationProcessing() {
  if (stopped) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  requested = true;
  if (active) return;
  requested = false;
  const handle = submitDesktopOperation('search-index-incremental', {
    id: 'search-index-incremental-maintenance',
    run: (context) => runWorkspaceSearchMaintenanceInWorker(BATCH_LIMIT, context.signal)
  });
  active = handle;
  notifyStatusWhenConnectionAvailable();
  void handle.promise.then((value) => {
    const result = value as { failed: number; processed: number } | undefined;
    if (result?.failed) throw new Error(`Search indexing failed for ${result.failed} queued items.`);
    retryDelayMs = 1000;
    if (result && result.processed >= BATCH_LIMIT) requested = true;
  }).catch((error) => {
    if (stopped) return;
    appendMainProcessDiagnosticLog('search_index_invalidation_processing_failed', { error });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      scheduleSearchIndexInvalidationProcessing();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
  }).finally(() => {
    notifyStatusWhenConnectionAvailable();
    if (active === handle) active = null;
    if (requested && !stopped) scheduleSearchIndexInvalidationProcessing();
  });
}
