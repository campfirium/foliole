import type { Node } from '../features/nodes/model/nodeTypes';

import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';

function getLocalFallbackStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export function readFallbackWorkspaceState(name: string) {
  const fallbackStorage = getLocalFallbackStorage();
  const persistedValue = fallbackStorage?.getItem(name) ?? null;
  if (!persistedValue) {
    return null;
  }

  const trimmedValue = trimPersistedWorkspaceStatePayload(persistedValue);
  if (trimmedValue !== persistedValue) {
    fallbackStorage?.setItem(name, trimmedValue);
  }
  return trimmedValue;
}

export function writeFallbackWorkspaceState(name: string, value: string) {
  getLocalFallbackStorage()?.setItem(name, value);
}

export function removeFallbackWorkspaceState(name: string) {
  getLocalFallbackStorage()?.removeItem(name);
}

function trimPersistedWorkspaceStatePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      state?: {
        activeNodeId?: string | null;
        nodesById?: Record<string, Node>;
      };
      version?: number;
    };
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return value;
    }
    if (!parsed.state.nodesById || typeof parsed.state.nodesById !== 'object') {
      return value;
    }

    return JSON.stringify({
      ...parsed,
      state: {
        ...parsed.state,
        nodesById: trimWorkspaceNodesForRendererBoundary(
          typeof parsed.state.activeNodeId === 'string' ? parsed.state.activeNodeId : null,
          parsed.state.nodesById,
          new Set(listPendingNodeSyncNodeIds())
        )
      }
    });
  } catch {
    return value;
  }
}
