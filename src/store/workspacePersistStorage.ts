import type { PersistStorage, StateStorage } from 'zustand/middleware';

import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import {
  readFallbackWorkspaceState,
  removeFallbackWorkspaceState,
  writeFallbackWorkspaceState
} from './workspacePersistStorageFallback';
import { getRuntimeWorkspaceState } from './workspacePersistStorageRuntimeHydrate';
import type { WorkspacePersistedState } from './workspaceStore';

const runtimeWorkspaceStatePromises = new Map<string, Promise<string | null>>();

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

export const workspacePersistStorage: StateStorage = {
  async getItem(name) {
    if (hasWorkspaceRuntimeRepository()) {
      return getRuntimeWorkspaceStateOnce(name);
    }
    return readFallbackWorkspaceState(name);
  },
  setItem(name, value) {
    if (hasWorkspaceRuntimeRepository()) {
      return;
    }
    writeFallbackWorkspaceState(name, value);
  },
  removeItem(name) {
    if (hasWorkspaceRuntimeRepository()) {
      return;
    }
    removeFallbackWorkspaceState(name);
  }
};

export const workspacePersistStoreStorage: PersistStorage<WorkspacePersistedState> = {
  async getItem(name) {
    const value = await workspacePersistStorage.getItem(name);
    return value ? JSON.parse(value) : null;
  },
  setItem(name, value) {
    if (hasWorkspaceRuntimeRepository()) {
      return;
    }
    return workspacePersistStorage.setItem(name, JSON.stringify(value));
  },
  removeItem(name) {
    return workspacePersistStorage.removeItem(name);
  }
};
