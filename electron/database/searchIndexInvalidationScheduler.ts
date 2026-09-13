import { setSearchIndexInvalidationScheduler } from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';
import type { DesktopTaskHandle } from '../desktopTaskTypes.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { runWorkspaceSearchMaintenanceInWorker } from '../ipc/searchIndexRebuildWorkerClient.js';

const BATCH_LIMIT = 500;

let active: DesktopTaskHandle | null = null;
let requested = false;
let stopped = true;

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
}

function scheduleSearchIndexInvalidationProcessing() {
  if (stopped) return;
  requested = true;
  if (active) return;
  requested = false;
  const handle = desktopTaskScheduler.submit({
    cancellable: true,
    concurrencyKey: 'search-index-rebuild',
    duplicatePolicy: 'enqueue',
    id: 'search-index-incremental-maintenance',
    label: 'Search index maintenance',
    priority: 'background',
    runOn: 'utility',
    source: 'search-invalidation',
    run: (context) => runWorkspaceSearchMaintenanceInWorker(BATCH_LIMIT, context.signal)
  });
  active = handle;
  void handle.promise.then((value) => {
    const result = value as { failed: number; processed: number } | undefined;
    if (result?.failed) throw new Error(`Search indexing failed for ${result.failed} queued items.`);
    if (result && result.processed >= BATCH_LIMIT) requested = true;
  }).catch((error) => {
    if (!stopped) appendMainProcessDiagnosticLog('search_index_invalidation_processing_failed', { error });
  }).finally(() => {
    if (active === handle) active = null;
    if (requested && !stopped) scheduleSearchIndexInvalidationProcessing();
  });
}
