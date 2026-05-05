import type { StateStorage } from 'zustand/middleware';

import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import {
  readFallbackWorkspaceState,
  removeFallbackWorkspaceState,
  writeFallbackWorkspaceState
} from './workspacePersistStorageFallback';
import { getRuntimeWorkspaceState } from './workspacePersistStorageRuntimeHydrate';

export const workspacePersistStorage: StateStorage = {
  async getItem(name) {
    if (hasWorkspaceRuntimeRepository()) {
      return getRuntimeWorkspaceState(name);
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
