import type { StateStorage } from 'zustand/middleware';

import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import {
  readFallbackWorkspaceState,
  removeFallbackWorkspaceState,
  writeFallbackWorkspaceState
} from './workspacePersistStorageFallback';
import { getRuntimeWorkspaceState } from './workspacePersistStorageRuntimeHydrate';

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
