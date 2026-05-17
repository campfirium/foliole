import { setSearchIndexInvalidationScheduler } from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { openDatabaseConnection } from './connection.js';

const BATCH_LIMIT = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let stopped = true;

export function startSearchIndexInvalidationScheduler() {
  stopped = false;
  setSearchIndexInvalidationScheduler(scheduleSearchIndexInvalidationProcessing);
  scheduleSearchIndexInvalidationProcessing();
}

export function stopSearchIndexInvalidationScheduler() {
  stopped = true;
  setSearchIndexInvalidationScheduler(null);
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleSearchIndexInvalidationProcessing() {
  if (stopped || timer || running) {
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    void drainSearchIndexInvalidations();
  }, 0);
}

async function drainSearchIndexInvalidations() {
  if (stopped || running) {
    return;
  }
  running = true;
  try {
    const result = processSearchIndexInvalidations(openDatabaseConnection().driver, BATCH_LIMIT);
    if (result.processed >= BATCH_LIMIT) {
      scheduleSearchIndexInvalidationProcessing();
    }
  } catch (error) {
    appendMainProcessDiagnosticLog('search_index_invalidation_processing_failed', { error });
  } finally {
    running = false;
  }
}
