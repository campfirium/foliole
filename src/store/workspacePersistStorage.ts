import type { StateStorage } from 'zustand/middleware';

import { getRuntimeInvoke } from '../shared/platform/bridge';

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
          runtimeInvoke('load_workspace_snapshot'),
          runtimeInvoke('load_reading_progress').catch(() => null)
        ]);
        return toPersistedStatePayload(mergeWorkspaceSnapshotWithReadingProgress(snapshot, readingProgress));
      } catch {
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
