import type { KeepImportSourceConfig } from './keepImportMonitorConfig.js';
import { isKeepImportWatchMissingDirectoryError, type KeepImportWatchHandle } from './keepImportWatch.js';

export interface KeepImportWatcherState {
  config: KeepImportSourceConfig;
  dirtySinceLastRun: boolean;
  importInFlight: boolean;
  missingWatchPaths: string[];
  rerunRequested: boolean;
  watchers: KeepImportWatchHandle[];
}

export interface KeepImportWatcherDeps {
  logMissingDirectory?(config: KeepImportSourceConfig, missingPaths: string[]): void;
  watch(rootPath: string, listener: () => void): KeepImportWatchHandle;
}

export function closeKeepImportWatchers(state: Pick<KeepImportWatcherState, 'watchers'>) {
  state.watchers.forEach((watcher) => watcher.close());
  state.watchers = [];
}

export function ensureKeepImportWatchers(
  deps: KeepImportWatcherDeps,
  state: KeepImportWatcherState,
  scheduleRun: () => void
) {
  if (state.watchers.length > 0) {
    return true;
  }
  state.missingWatchPaths = [];
  for (const watchPath of state.config.watchPaths) {
    try {
      state.watchers.push(deps.watch(watchPath, () => {
        state.dirtySinceLastRun = true;
        if (state.importInFlight) {
          state.rerunRequested = true;
          return;
        }
        scheduleRun();
      }));
    } catch (error) {
      if (!isKeepImportWatchMissingDirectoryError(error)) {
        closeKeepImportWatchers(state);
        throw error;
      }
      state.missingWatchPaths.push(error.directoryPath);
    }
  }
  if (state.missingWatchPaths.length > 0) {
    deps.logMissingDirectory?.(state.config, state.missingWatchPaths);
  }
  return state.watchers.length > 0;
}
