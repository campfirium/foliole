import type { PersistStorage } from 'zustand/middleware';

import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { hasWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import {
  readFallbackWorkspaceState,
  removeFallbackWorkspaceState,
  writeFallbackWorkspaceState
} from './workspacePersistStorageFallback';
import { getRuntimeWorkspaceState } from './workspacePersistStorageRuntimeHydrate';
import type { WorkspacePersistedState } from './workspaceStore';

const runtimeWorkspaceStatePromises = new Map<string, ReturnType<typeof getRuntimeWorkspaceState>>();

function getRuntimeWorkspaceStateOnce(name: string) {
  const existingPromise = runtimeWorkspaceStatePromises.get(name);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = getRuntimeWorkspaceState(name).finally(() => {
    runtimeWorkspaceStatePromises.delete(name);
  });
  runtimeWorkspaceStatePromises.set(name, promise);
  return promise;
}

export const workspacePersistStoreStorage: PersistStorage<WorkspacePersistedState> = {
  async getItem(name) {
    if (hasWorkspaceRuntimeRepository()) {
      return getRuntimeWorkspaceStateOnce(name);
    }
    const value = readFallbackWorkspaceState(name);
    return value ? JSON.parse(value) : null;
  },
  setItem(name, value) {
    if (hasWorkspaceRuntimeRepository() || hasWorkspaceBrowserCommit()) {
      return;
    }
    writeFallbackWorkspaceState(name, JSON.stringify(value));
  },
  removeItem(name) {
    if (hasWorkspaceRuntimeRepository() || hasWorkspaceBrowserCommit()) {
      return;
    }
    removeFallbackWorkspaceState(name);
  }
};
