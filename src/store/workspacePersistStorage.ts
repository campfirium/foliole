import type { StateStorage } from 'zustand/middleware';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { logRuntimeError, logRuntimeWarning } from '../shared/platform/runtimeLogging';

import { mergePendingNodeSyncIntoSnapshot, replayPendingNodeSync } from './workspacePendingNodeSync';
import { mergeWorkspaceSnapshotWithReadingProgress } from './workspaceReadingProgress';

function getLocalFallbackStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function toPersistedStatePayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return JSON.stringify({ state: value, version: 0 });
}

export const workspacePersistStorage: StateStorage = {
  async getItem(name) {
    const runtimeInvoke = getRuntimeInvoke();
    if (runtimeInvoke) {
      try {
        const [snapshot, readingProgress] = await Promise.all([
          runtimeInvoke(NATIVE_COMMANDS.loadWorkspaceSnapshot),
          runtimeInvoke(NATIVE_COMMANDS.loadReadingProgress).catch((error) => {
            logRuntimeWarning('reading progress load failed during workspace hydrate', {
              area: 'persistence',
              action: 'hydrate_workspace_state',
              command: NATIVE_COMMANDS.loadReadingProgress,
              fallback: 'merge_snapshot_without_reading_progress',
              storageKey: name,
              error
            });
            return null;
          })
        ]);
        const mergedSnapshot = mergeWorkspaceSnapshotWithReadingProgress(
          mergePendingNodeSyncIntoSnapshot(snapshot),
          readingProgress
        );
        void replayPendingNodeSync(runtimeInvoke).catch((error) => {
          logRuntimeWarning('pending node sync replay failed during workspace hydrate', {
            area: 'persistence',
            action: 'replay_pending_node_sync',
            command: NATIVE_COMMANDS.updateNodeContent,
            fallback: 'keep_pending_snapshot',
            storageKey: name,
            error
          });
        });
        return toPersistedStatePayload(mergedSnapshot);
      } catch (error) {
        logRuntimeError('workspace hydrate failed', {
          area: 'persistence',
          action: 'hydrate_workspace_state',
          command: NATIVE_COMMANDS.loadWorkspaceSnapshot,
          relatedCommand: NATIVE_COMMANDS.loadReadingProgress,
          fallback: 'return_null',
          storageKey: name,
          error
        });
        return null;
      }
    }
    return getLocalFallbackStorage()?.getItem(name) ?? null;
  },
  setItem(name, value) {
    if (getRuntimeInvoke()) {
      return;
    }
    getLocalFallbackStorage()?.setItem(name, value);
  },
  removeItem(name) {
    if (getRuntimeInvoke()) {
      return;
    }
    getLocalFallbackStorage()?.removeItem(name);
  }
};
