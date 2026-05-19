import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { submitImportMonitorTask } from './importMonitorTaskScheduler.js';
import { type KeepImportConfig, type KeepImportSourceConfig, resolveKeepImportConfigs } from './keepImportMonitorConfig.js';
import type { KeepImportWatchHandle } from './keepImportWatch.js';

export interface KeepImportMonitorDeps {
  debounceMs: number;
  loadSettings(): ImportManagerSettings;
  logError(message: string, error: unknown): void;
  runCycle(config: KeepImportConfig): Promise<void>;
  watch(rootPath: string, listener: () => void): KeepImportWatchHandle;
}

interface KeepImportSourceState {
  config: KeepImportSourceConfig;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  hasCompletedRun: boolean;
  dirtySinceLastRun: boolean;
  importInFlight: boolean;
  rerunRequested: boolean;
  watchers: KeepImportWatchHandle[];
}

export interface KeepImportMonitor {
  refreshFromSettings(): Promise<void>;
  isSnapshotFresh(ruleId: string): boolean;
  start(): Promise<void>;
  stop(): void;
}

function createSourceState(config: KeepImportSourceConfig): KeepImportSourceState {
  return {
    config,
    debounceTimer: null,
    dirtySinceLastRun: false,
    hasCompletedRun: false,
    importInFlight: false,
    rerunRequested: false,
    watchers: []
  };
}

function clearScheduledRun(state: KeepImportSourceState) {
  if (!state.debounceTimer) {
    return;
  }
  clearTimeout(state.debounceTimer);
  state.debounceTimer = null;
}

function closeWatcher(state: KeepImportSourceState) {
  state.watchers.forEach((watcher) => watcher.close());
  state.watchers = [];
}

async function ensureWatcher(
  deps: KeepImportMonitorDeps,
  state: KeepImportSourceState,
  scheduleRun: () => void
) {
  if (state.watchers.length > 0) {
    return;
  }
  state.watchers = state.config.watchPaths.map((watchPath) =>
    deps.watch(watchPath, () => {
      state.dirtySinceLastRun = true;
      if (state.importInFlight) {
        state.rerunRequested = true;
        return;
      }
      scheduleRun();
    })
  );
}

async function runImportCycle(
  deps: KeepImportMonitorDeps,
  startedRef: { current: boolean },
  state: KeepImportSourceState,
  scheduleRun: () => void
) {
  if (!startedRef.current) {
    return;
  }
  if (state.importInFlight) {
    state.rerunRequested = true;
    return;
  }
  state.importInFlight = true;
  try {
    await ensureWatcher(deps, state, scheduleRun);
    do {
      state.rerunRequested = false;
      await deps.runCycle(state.config);
      state.hasCompletedRun = true;
      state.dirtySinceLastRun = false;
    } while (state.rerunRequested && startedRef.current);
  } catch (error) {
    deps.logError(`[keep-import] auto cycle failed for ${state.config.directoryPath}`, error);
  } finally {
    state.importInFlight = false;
  }
}

function startConfigRun(
  deps: KeepImportMonitorDeps,
  startedRef: { current: boolean },
  state: KeepImportSourceState
) {
  function scheduleRun(immediate = false) {
    if (!startedRef.current) {
      return;
    }
    clearScheduledRun(state);
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      submitImportMonitorTask({
        concurrencyKey: `keep-import:${state.config.adapterConfigId}`,
        failureLabel: `[keep-import] auto cycle failed for ${state.config.directoryPath}`,
        id: `keep-import:${state.config.adapterConfigId}`,
        label: 'Keep import cycle',
        run: () => runImportCycle(deps, startedRef, state, () => scheduleRun()),
        source: 'keep-import'
      });
    }, immediate ? 0 : deps.debounceMs);
  }

  scheduleRun(true);
  return scheduleRun;
}

function isSameSourceConfig(left: KeepImportSourceConfig, right: KeepImportSourceConfig) {
  return (
    left.directoryPath === right.directoryPath &&
    left.highlightMode === right.highlightMode &&
    left.highlightPolicy === right.highlightPolicy &&
    left.watchPaths.join('\u001f') === right.watchPaths.join('\u001f')
  );
}

function syncSourceState(input: {
  deps: KeepImportMonitorDeps;
  config: KeepImportSourceConfig;
  sourceStateById: Map<string, KeepImportSourceState>;
  startedRef: { current: boolean };
  stopSource(state: KeepImportSourceState): void;
}) {
  const existingState = input.sourceStateById.get(input.config.adapterConfigId);
  if (existingState && isSameSourceConfig(existingState.config, input.config)) {
    return;
  }
  if (existingState) {
    input.stopSource(existingState);
  }
  const nextState = createSourceState(input.config);
  input.sourceStateById.set(input.config.adapterConfigId, nextState);
  startConfigRun(input.deps, input.startedRef, nextState);
}

export function createKeepImportMonitor(deps: KeepImportMonitorDeps): KeepImportMonitor {
  const sourceStateById = new Map<string, KeepImportSourceState>();
  const startedRef = { current: false };

  function stopSource(state: KeepImportSourceState) {
    clearScheduledRun(state);
    closeWatcher(state);
    state.rerunRequested = false;
  }

  async function refreshFromSettings() {
    if (!startedRef.current) {
      return;
    }

    const nextConfigs = resolveKeepImportConfigs(deps.loadSettings());
    const nextConfigIds = new Set(nextConfigs.map((config) => config.adapterConfigId));

    for (const [configId, state] of sourceStateById) {
      if (nextConfigIds.has(configId)) {
        continue;
      }
      stopSource(state);
      sourceStateById.delete(configId);
    }

    nextConfigs.forEach((config) => syncSourceState({ config, deps, sourceStateById, startedRef, stopSource }));
  }

  return {
    refreshFromSettings,
    isSnapshotFresh(ruleId: string) {
      const state = sourceStateById.get(ruleId);
      return Boolean(
        startedRef.current &&
        state?.hasCompletedRun &&
        !state.importInFlight &&
        !state.rerunRequested &&
        !state.debounceTimer &&
        !state.dirtySinceLastRun
      );
    },
    async start() {
      if (startedRef.current) {
        return;
      }
      startedRef.current = true;
      await refreshFromSettings();
    },
    stop() {
      startedRef.current = false;
      for (const state of sourceStateById.values()) {
        stopSource(state);
      }
      sourceStateById.clear();
    }
  };
}

export {
  isKeepImportMonitorSnapshotFresh,
  refreshKeepImportMonitorFromSettings,
  startKeepImportMonitor,
  stopKeepImportMonitor
} from './keepImportMonitorRuntime.js';
