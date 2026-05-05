import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../shared/platform/bridge';

import { readCachedWorkspaceNodeDocument, writeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { useWorkspaceStore } from './workspaceStore';

export interface WorkspaceNodeDocumentLoadOptions {
  onLoadResolved?: (document: WorkspaceNodeDocument) => void;
  onLoadStarted?: () => void;
  preloadedDocument?: WorkspaceNodeDocument | null;
}

const pendingNodeDocumentLoadById = new Map<string, Promise<WorkspaceNodeDocument | null>>();

export function shouldSkipNodeDocumentPreparation(nodeId: string) {
  const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
  return !targetNode || isNodeDocumentLoaded(targetNode);
}

export function hasPendingNodeDocumentLoad(nodeId: string) {
  return pendingNodeDocumentLoadById.has(nodeId);
}

export async function loadWorkspaceNodeDocument(
  nodeId: string,
  options: WorkspaceNodeDocumentLoadOptions
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke && !options.preloadedDocument) {
    return null;
  }

  let document = options.preloadedDocument ?? null;
  if (!document) {
    const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
    if (cachedDocument) {
      options.onLoadResolved?.(cachedDocument);
      return cachedDocument;
    }

    const pendingLoad = pendingNodeDocumentLoadById.get(nodeId);
    if (pendingLoad) {
      document = await pendingLoad;
    } else {
      options.onLoadStarted?.();
      const loadPromise =
        runtimeInvoke?.(NATIVE_COMMANDS.loadNodeDocument, { nodeId })?.then((loadedDocument) => {
          if (!loadedDocument) {
            return null;
          }
          writeCachedWorkspaceNodeDocument(nodeId, loadedDocument);
          return loadedDocument;
        }) ?? Promise.resolve(null);
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
