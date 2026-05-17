import fs from 'node:fs';

import type { NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { runManagedInboxImport } from '../ipc/importDirectory.js';
import { loadLibraryPathSettings } from '../ipc/libraryPaths.js';
import { ensureManagedInboxRoot, resolveManagedInboxPaths } from '../ipc/managedInboxFolder.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { submitImportMonitorTask } from './importMonitorTaskScheduler.js';
import { notifyManagedInboxUpdated } from './managedInboxEvents.js';

interface ManagedInboxWatchHandle {
  close(): void;
}

interface ManagedInboxMonitorDeps {
  debounceMs: number;
  ensureRoot(rootPath: string): Promise<void>;
  loadConfiguredRootPath(): Promise<string>;
  logError(message: string, error: unknown): void;
  notifyUpdate(importId: string): void;
  runImport(rootPath: string): Promise<NativeDirectoryImportResult>;
  watch(rootPath: string, listener: () => void): ManagedInboxWatchHandle;
}

export interface ManagedInboxMonitor {
  refreshFromSettings(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
}

async function loadConfiguredManagedInboxRootPath() {
  return resolveManagedInboxPaths(resolveAppPaths().app_data_dir, (await loadLibraryPathSettings()).inbox).rootPath;
}

function watchManagedInboxDirectory(rootPath: string, listener: () => void): ManagedInboxWatchHandle {
  try {
    const watcher = fs.watch(rootPath, { recursive: true }, listener);
    return {
      close() {
        watcher.close();
      }
    };
  } catch {
    const watcher = fs.watch(rootPath, listener);
    return {
      close() {
        watcher.close();
      }
    };
  }
}

function createDefaultManagedInboxMonitorDeps(): ManagedInboxMonitorDeps {
  return {
    debounceMs: 250,
    ensureRoot: ensureManagedInboxRoot,
    loadConfiguredRootPath: loadConfiguredManagedInboxRootPath,
    logError(message, error) {
      console.error(message, error);
    },
    notifyUpdate: notifyManagedInboxUpdated,
    runImport: runManagedInboxImport,
    watch: watchManagedInboxDirectory
  };
}

interface ManagedInboxMonitorState {
  currentRootPath: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  importInFlight: boolean;
  rerunRequested: boolean;
  started: boolean;
  watcher: ManagedInboxWatchHandle | null;
}

function createManagedInboxMonitorState(): ManagedInboxMonitorState {
  return {
    currentRootPath: null,
    debounceTimer: null,
    importInFlight: false,
    rerunRequested: false,
    started: false,
    watcher: null
  };
}

function clearScheduledRun(state: ManagedInboxMonitorState) {
  if (!state.debounceTimer) {
    return;
  }
  clearTimeout(state.debounceTimer);
  state.debounceTimer = null;
}

function closeWatcher(state: ManagedInboxMonitorState) {
  state.watcher?.close();
  state.watcher = null;
}

function requestRerun(state: ManagedInboxMonitorState) {
  state.rerunRequested = true;
}

function resolveLatestImportId(result: NativeDirectoryImportResult) {
  const latestEntry = result.entries[result.entries.length - 1];
  return typeof latestEntry?.import_id === 'string' ? latestEntry.import_id : null;
}

async function ensureWatcher(
  deps: ManagedInboxMonitorDeps,
  state: ManagedInboxMonitorState,
  scheduleRun: () => void,
  rootPath: string
) {
  if (state.currentRootPath === rootPath && state.watcher) {
    return;
  }
  closeWatcher(state);
  state.currentRootPath = rootPath;
  await deps.ensureRoot(rootPath);
  state.watcher = deps.watch(rootPath, () => {
    if (state.importInFlight) {
      requestRerun(state);
      return;
    }
    scheduleRun();
  });
}

async function runImportCycle(
  deps: ManagedInboxMonitorDeps,
  state: ManagedInboxMonitorState,
  scheduleRun: () => void,
  initialRootPath?: string
) {
  if (!state.started) {
    return;
  }
  if (state.importInFlight) {
    requestRerun(state);
    return;
  }
  state.importInFlight = true;
  try {
    let nextRootPath = initialRootPath ?? null;
    do {
      state.rerunRequested = false;
      const rootPath = nextRootPath ?? (await deps.loadConfiguredRootPath());
      nextRootPath = null;
      await ensureWatcher(deps, state, scheduleRun, rootPath);
      const result = await deps.runImport(rootPath);
      const latestImportId = resolveLatestImportId(result);
      if (latestImportId) {
        deps.notifyUpdate(latestImportId);
      }
    } while (state.rerunRequested && state.started);
  } catch (error) {
    deps.logError('[managed-inbox] auto import cycle failed', error);
  } finally {
    state.importInFlight = false;
  }
}

export function createManagedInboxMonitor(
  deps: ManagedInboxMonitorDeps = createDefaultManagedInboxMonitorDeps()
): ManagedInboxMonitor {
  const state = createManagedInboxMonitorState();

  function scheduleRun(immediate = false) {
    if (!state.started) {
      return;
    }
    clearScheduledRun(state);
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      submitImportMonitorTask({
        concurrencyKey: 'managed-inbox-import',
        failureLabel: '[managed-inbox] auto import cycle failed',
        id: 'managed-inbox-import-cycle',
        label: 'Managed inbox import cycle',
        run: () => runImportCycle(deps, state, () => scheduleRun()),
        source: 'managed-inbox'
      });
    }, immediate ? 0 : deps.debounceMs);
  }

  async function refreshFromSettings() {
    if (!state.started) {
      return;
    }
    const rootPath = await deps.loadConfiguredRootPath();
    await ensureWatcher(deps, state, () => scheduleRun(), rootPath);
    clearScheduledRun(state);
    await runImportCycle(deps, state, () => scheduleRun(), rootPath);
  }

  return {
    refreshFromSettings,
    async start() {
      if (state.started) {
        return;
      }
      state.started = true;
      await refreshFromSettings();
    },
    stop() {
      state.started = false;
      clearScheduledRun(state);
      closeWatcher(state);
      state.currentRootPath = null;
      state.rerunRequested = false;
    }
  };
}

const managedInboxMonitor = createManagedInboxMonitor();

export async function startManagedInboxMonitor() {
  await managedInboxMonitor.start();
}

export async function refreshManagedInboxMonitorFromSettings() {
  await managedInboxMonitor.refreshFromSettings();
}

export function stopManagedInboxMonitor() {
  managedInboxMonitor.stop();
}
