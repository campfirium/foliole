import {
  setSearchIndexInvalidationScheduler,
  type SearchIndexInvalidationProcessingOptions
} from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { openDatabaseConnection } from './connection.js';

const BATCH_LIMIT = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let timerKind: 'deferred' | 'immediate' | null = null;
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
    timerKind = null;
  }
}

function scheduleSearchIndexInvalidationProcessing(options?: SearchIndexInvalidationProcessingOptions) {
  if (stopped || running) {
    return;
  }
  const delayMs = Math.max(0, options?.delayMs ?? 0);
  const nextKind = delayMs > 0 ? 'deferred' : 'immediate';
  if (timer) {
    if (timerKind === 'immediate' && nextKind === 'deferred') return;
    clearTimeout(timer);
  }
  timerKind = nextKind;
  timer = setTimeout(() => {
    timer = null;
    timerKind = null;
    void drainSearchIndexInvalidations();
  }, delayMs);
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
