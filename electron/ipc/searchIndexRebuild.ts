import { BrowserWindow } from 'electron';

import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_VALUES,
  type FullTextSearchIndexStrategy
} from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import {
  markWorkspaceSearchSidecarRebuilding,
  readWorkspaceSearchSidecarRebuildStatus,
  type WorkspaceSearchSidecarRebuildStatus
} from '../../lib/core/database/workspaceSearchSidecar.js';
import { openDatabaseConnection } from '../database/connection.js';
import { rebuildExternalSearchCacheStrategy } from '../database/externalSearchCacheDatabase.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import {
  IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL,
  type SearchIndexRebuildStatusEvent
} from './contracts.js';
import { runWorkspaceSearchRebuildInWorker } from './searchIndexRebuildWorkerClient.js';

let activeStrategy: FullTextSearchIndexStrategy | null = null;
let pendingStrategy: FullTextSearchIndexStrategy | null = null;
let scheduled = false;

export function asFullTextSearchIndexStrategy(value: unknown): FullTextSearchIndexStrategy {
  if (FULL_TEXT_SEARCH_INDEX_STRATEGY_VALUES.includes(value as FullTextSearchIndexStrategy)) {
    return value as FullTextSearchIndexStrategy;
  }
  throw new Error('invalid search index strategy');
}

function toSearchIndexRebuildStatusEvent(
  status: WorkspaceSearchSidecarRebuildStatus | null
): SearchIndexRebuildStatusEvent | null {
  if (!status) return null;
  const event: SearchIndexRebuildStatusEvent = {
    status: status.status,
    strategy: status.strategy
  };
  if (status.error) {
    event.error = status.error;
  }
  return event;
}

function notifySearchIndexRebuildStatus(status: WorkspaceSearchSidecarRebuildStatus | null) {
  const payload = toSearchIndexRebuildStatusEvent(status);
  if (!payload) return;
  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL, payload);
  }
}

function combineRebuildStatus(
  workspaceStatus: WorkspaceSearchSidecarRebuildStatus,
  externalStatus: WorkspaceSearchSidecarRebuildStatus
): WorkspaceSearchSidecarRebuildStatus {
  if (workspaceStatus.status === 'failed' || externalStatus.status === 'failed') {
    return {
      error: [workspaceStatus.error, externalStatus.error].filter(Boolean).join('; ') || 'Search index rebuild failed',
      status: 'failed',
      strategy: externalStatus.strategy,
      tokenizer: externalStatus.tokenizer
    };
  }
  return externalStatus.status === 'rebuilding' ? externalStatus : workspaceStatus;
}

function scheduleRebuildDrain() {
  if (scheduled) return;
  scheduled = true;
  setImmediate(drainRebuildQueue);
}

function drainRebuildQueue() {
  scheduled = false;
  if (activeStrategy || !pendingStrategy) return;
  const strategy = pendingStrategy;
  pendingStrategy = null;
  activeStrategy = strategy;
  const handle = desktopTaskScheduler.submit({
    concurrencyKey: 'search-index-rebuild',
    duplicatePolicy: 'enqueue',
    failureLabel: '[search] index rebuild failed',
    id: `search-index-rebuild:${strategy}`,
    label: 'Search index rebuild',
    priority: 'background',
    run: async (context) => {
      context.progress({ message: 'rebuilding search index', unit: 'index' });
      const workspaceStatus = await runWorkspaceSearchRebuildInWorker(strategy);
      await context.yieldIfNeeded();
      return combineRebuildStatus(workspaceStatus, rebuildExternalSearchCacheStrategy(strategy));
    },
    runOn: 'utility',
    source: 'search-index-rebuild'
  });
  void handle.promise
    .then((status) => {
      notifySearchIndexRebuildStatus(status as WorkspaceSearchSidecarRebuildStatus);
    })
    .finally(() => {
      activeStrategy = null;
      if (pendingStrategy) scheduleRebuildDrain();
    });
}

export function loadSearchIndexRebuildStatus(): SearchIndexRebuildStatusEvent | null {
  return toSearchIndexRebuildStatusEvent(
    readWorkspaceSearchSidecarRebuildStatus(openDatabaseConnection().sqlite)
  );
}

export function requestSearchIndexRebuild(strategy: FullTextSearchIndexStrategy): SearchIndexRebuildStatusEvent {
  pendingStrategy = strategy;
  const status = markWorkspaceSearchSidecarRebuilding(openDatabaseConnection(), strategy);
  notifySearchIndexRebuildStatus(status);
  scheduleRebuildDrain();
  return toSearchIndexRebuildStatusEvent(status) as SearchIndexRebuildStatusEvent;
}

export function resetSearchIndexRebuildRuntimeForTests() {
  activeStrategy = null;
  pendingStrategy = null;
  scheduled = false;
}
