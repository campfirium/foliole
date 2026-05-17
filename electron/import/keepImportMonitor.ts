import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { submitImportMonitorTask } from './importMonitorTaskScheduler.js';
import { type KeepImportConfig, type KeepImportSourceConfig, resolveKeepImportConfigs } from './keepImportMonitorConfig.js';
import { runKeepImportRule } from './keepImportService.js';
import { type KeepImportWatchHandle, watchKeepImportDirectory } from './keepImportWatch.js';

interface KeepImportMonitorDeps {
  debounceMs: number;
  loadSettings(): ImportManagerSettings;
  logError(message: string, error: unknown): void;
  runCycle(config: KeepImportConfig): Promise<void>;
  watch(rootPath: string, listener: () => void): KeepImportWatchHandle;
}

interface KeepImportSourceState {
  config: KeepImportSourceConfig;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  importInFlight: boolean;
  rerunRequested: boolean;
  watchers: KeepImportWatchHandle[];
}

export interface KeepImportMonitor {
  refreshFromSettings(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
}

function createDefaultKeepImportMonitorDeps(): KeepImportMonitorDeps {
  return {
    debounceMs: 250,
    loadSettings: loadImportManagerSettings,
    logError(message, error) {
      console.error(message, error);
    },
    async runCycle(config) {
      await runKeepImportRule({
        directoryPath: config.directoryPath,
        highlightPolicy: config.highlightPolicy,
        ruleId: config.adapterConfigId,
        sourceType: config.sourceType
      });
    },
    watch: watchKeepImportDirectory
  };
}

function createSourceState(config: KeepImportSourceConfig): KeepImportSourceState {
  return {
    config,
    debounceTimer: null,
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

export function createKeepImportMonitor(
  deps: KeepImportMonitorDeps = createDefaultKeepImportMonitorDeps()
): KeepImportMonitor {
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

    for (const config of nextConfigs) {
      const existingState = sourceStateById.get(config.adapterConfigId);
      if (
        existingState &&
        existingState.config.directoryPath === config.directoryPath &&
        existingState.config.highlightPolicy === config.highlightPolicy &&
        existingState.config.watchPaths.join('\u001f') === config.watchPaths.join('\u001f')
      ) {
        continue;
      }

      if (existingState) {
        stopSource(existingState);
      }

      const nextState = createSourceState(config);
      sourceStateById.set(config.adapterConfigId, nextState);
      startConfigRun(deps, startedRef, nextState);
    }
  }

  return {
    refreshFromSettings,
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

const keepImportMonitor = createKeepImportMonitor();

export async function startKeepImportMonitor() {
  await keepImportMonitor.start();
}

export async function refreshKeepImportMonitorFromSettings() {
  await keepImportMonitor.refreshFromSettings();
}

export function stopKeepImportMonitor() {
  keepImportMonitor.stop();
}
