import {
  hasWorkspaceRuntimeRepository,
  loadWorkspaceNodeDocumentFromRuntime
} from '../shared/platform/workspaceRuntimeRepository';

import { readCachedWorkspaceNodeDocument, writeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { getNodeDocumentStatus, isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { useWorkspaceStore } from './workspaceStore';

export interface WorkspaceNodeDocumentLoadOptions {
  forceLoad?: boolean;
  onLoadResolved?: (document: WorkspaceNodeDocument) => void;
  onLoadStarted?: () => void;
  preloadedDocument?: WorkspaceNodeDocument | null;
}

const pendingNodeDocumentLoadById = new Map<string, Promise<WorkspaceNodeDocument | null>>();

function isCachedDocumentCurrent(nodeId: string, document: WorkspaceNodeDocument) {
  const nodeUpdatedAt = useWorkspaceStore.getState().nodesById[nodeId]?.updatedAt?.trim();
  const cachedUpdatedAt = document.updatedAt?.trim();
  return !nodeUpdatedAt || !cachedUpdatedAt || cachedUpdatedAt >= nodeUpdatedAt;
}

export function shouldSkipNodeDocumentPreparation(nodeId: string) {
  const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
  return !targetNode || isNodeDocumentLoaded(targetNode) || getNodeDocumentStatus(targetNode) === 'failed';
}

export function hasPendingNodeDocumentLoad(nodeId: string) {
  return pendingNodeDocumentLoadById.has(nodeId);
}

export async function loadWorkspaceNodeDocument(
  nodeId: string,
  options: WorkspaceNodeDocumentLoadOptions
) {
  if (!hasWorkspaceRuntimeRepository() && !options.preloadedDocument) {
    return null;
  }

  let document = options.preloadedDocument ?? null;
  if (!document) {
    const cachedDocument = options.forceLoad ? null : readCachedWorkspaceNodeDocument(nodeId);
    if (cachedDocument && isCachedDocumentCurrent(nodeId, cachedDocument)) {
      options.onLoadResolved?.(cachedDocument);
      return cachedDocument;
    }

    const pendingLoad = pendingNodeDocumentLoadById.get(nodeId);
    if (pendingLoad) {
      document = await pendingLoad;
    } else {
      options.onLoadStarted?.();
      const loadPromise =
        loadWorkspaceNodeDocumentFromRuntime(nodeId).then((loadedDocument) => {
          if (!loadedDocument) {
            return null;
          }
          writeCachedWorkspaceNodeDocument(nodeId, loadedDocument);
          return loadedDocument;
        });
      pendingNodeDocumentLoadById.set(nodeId, loadPromise);
      try {
        document = await loadPromise;
      } finally {
        pendingNodeDocumentLoadById.delete(nodeId);
      }
      if (document) {
        options.onLoadResolved?.(document);
      }
    }
  } else {
    writeCachedWorkspaceNodeDocument(nodeId, document);
    options.onLoadResolved?.(document);
  }
  return document;
}

export function resetWorkspaceNodeDocumentLoaderForTest() {
  pendingNodeDocumentLoadById.clear();
}
