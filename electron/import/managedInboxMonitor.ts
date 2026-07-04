import fs from 'node:fs';

import type { NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import type { NativeNodeMutationPatchResult } from '../../lib/platform/nativeContract.js';
import { runManagedInboxImport } from '../ipc/importDirectory.js';
import { ensureManagedInboxRoot } from '../ipc/managedInboxFolder.js';

import { submitImportMonitorTask } from './importMonitorTaskScheduler.js';
import { notifyManagedInboxUpdated } from './managedInboxEvents.js';
import { areSameManagedInboxRootSpecs, loadConfiguredManagedInboxRootPaths, type ManagedInboxRootSpec } from './managedInboxRoots.js';

interface ManagedInboxWatchHandle {
  close(): void;
}

interface ManagedInboxMonitorDeps {
  debounceMs: number;
  ensureRoot(rootPath: string): Promise<void>;
  loadConfiguredRootPaths(): Promise<ManagedInboxRootSpec[]>;
  logError(message: string, error: unknown): void;
  notifyUpdate(importId: string, nodeMutationPatch?: NativeNodeMutationPatchResult | null): void;
  runImport(rootPath: string, options?: { importRootPath?: string }): Promise<NativeDirectoryImportResult>;
  watch(rootPath: string, listener: () => void): ManagedInboxWatchHandle;
}

export interface ManagedInboxMonitor {
  refreshFromSettings(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
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
    loadConfiguredRootPaths: loadConfiguredManagedInboxRootPaths,
    logError(message, error) {
      console.error(message, error);
    },
    notifyUpdate: notifyManagedInboxUpdated,
    runImport: runManagedInboxImport,
    watch: watchManagedInboxDirectory
  };
}

interface ManagedInboxMonitorState {
  currentRootPaths: string[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  importInFlight: boolean;
  rerunRequested: boolean;
  started: boolean;
  watchers: ManagedInboxWatchHandle[];
}

function createManagedInboxMonitorState(): ManagedInboxMonitorState {
  return {
    currentRootPaths: [],
    debounceTimer: null,
    importInFlight: false,
    rerunRequested: false,
    started: false,
    watchers: []
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
  state.watchers.forEach((watcher) => watcher.close());
  state.watchers = [];
}

function requestRerun(state: ManagedInboxMonitorState) {
  state.rerunRequested = true;
}

function resolveLatestWorkspaceImportId(result: NativeDirectoryImportResult) {
  for (let index = result.entries.length - 1; index >= 0; index -= 1) {
    const entry = result.entries[index];
    if (
      entry?.result_status === 'imported' &&
      entry.duplicate_semantic !== 'duplicate' &&
      typeof entry.import_id === 'string'
    ) {
      return entry.import_id;
    }
  }
  return null;
}

async function ensureWatchers(
  deps: ManagedInboxMonitorDeps,
  state: ManagedInboxMonitorState,
  scheduleRun: () => void,
  rootSpecs: ManagedInboxRootSpec[]
) {
  if (areSameManagedInboxRootSpecs(state.currentRootPaths, rootSpecs) && state.watchers.length === rootSpecs.length) {
    return;
  }
  closeWatcher(state);
  state.currentRootPaths = rootSpecs.map((spec) => spec.rootPath);
  for (const spec of rootSpecs) {
    await deps.ensureRoot(spec.rootPath);
    state.watchers.push(deps.watch(spec.rootPath, () => {
      if (state.importInFlight) {
        requestRerun(state);
        return;
      }
      scheduleRun();
    }));
  }
}

async function runImportCycle(
  deps: ManagedInboxMonitorDeps,
  state: ManagedInboxMonitorState,
  scheduleRun: () => void,
  initialRootSpecs?: ManagedInboxRootSpec[]
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
    let nextRootSpecs = initialRootSpecs ?? null;
    do {
      state.rerunRequested = false;
      const rootSpecs = nextRootSpecs ?? (await deps.loadConfiguredRootPaths());
      nextRootSpecs = null;
      await ensureWatchers(deps, state, scheduleRun, rootSpecs);
      for (const spec of rootSpecs) {
        const result = await deps.runImport(
          spec.rootPath,
          spec.importRootPath ? { importRootPath: spec.importRootPath } : undefined
        );
        const latestImportId = resolveLatestWorkspaceImportId(result);
        if (latestImportId) {
          deps.notifyUpdate(latestImportId, result.node_mutation_patch);
        }
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
    const rootSpecs = await deps.loadConfiguredRootPaths();
    await ensureWatchers(deps, state, () => scheduleRun(), rootSpecs);
    clearScheduledRun(state);
    await runImportCycle(deps, state, () => scheduleRun(), rootSpecs);
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
      state.currentRootPaths = [];
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
