import {
  hasWorkspaceRuntimeRepository,
  loadWorkspaceNodeDocumentFromRuntime
} from '../shared/platform/workspaceRuntimeRepository';

import {
  readCachedWorkspaceNodeDocument,
  removeCachedWorkspaceNodeDocument,
  writeCachedWorkspaceNodeDocument
} from './workspaceNodeDocumentCache';
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

interface WorkspaceNodeDocumentLoadBaseline {
  cachedDocument: WorkspaceNodeDocument | null;
  documentLoaded: boolean;
  nodeUpdatedAt: string;
}

function normalizedUpdatedAt(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function captureWorkspaceNodeDocumentLoadBaseline(nodeId: string): WorkspaceNodeDocumentLoadBaseline {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  return {
    cachedDocument: readCachedWorkspaceNodeDocument(nodeId),
    documentLoaded: isNodeDocumentLoaded(node),
    nodeUpdatedAt: normalizedUpdatedAt(node?.updatedAt)
  };
}

function isDocumentOlderThanNode(document: WorkspaceNodeDocument, nodeUpdatedAt: string) {
  const documentUpdatedAt = normalizedUpdatedAt(document.updatedAt);
  return Boolean(nodeUpdatedAt && documentUpdatedAt && documentUpdatedAt < nodeUpdatedAt);
}

function isLoadResultCurrent(
  nodeId: string,
  document: WorkspaceNodeDocument,
  baseline: WorkspaceNodeDocumentLoadBaseline
) {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  if (!node) {
    return false;
  }
  const nodeUpdatedAt = normalizedUpdatedAt(node.updatedAt);
  if (isDocumentOlderThanNode(document, nodeUpdatedAt)) {
    return false;
  }
  const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
  if (cachedDocument !== baseline.cachedDocument && cachedDocument !== document) {
    return false;
  }
  if (baseline.nodeUpdatedAt !== nodeUpdatedAt && !normalizedUpdatedAt(document.updatedAt)) {
    return false;
  }
  return baseline.documentLoaded || !isNodeDocumentLoaded(node) || cachedDocument === document;
}

async function loadWorkspaceNodeDocumentFromPendingRuntime(
  nodeId: string,
  onLoadStarted?: () => void
) {
  const pendingLoad = pendingNodeDocumentLoadById.get(nodeId);
  if (pendingLoad) {
    return pendingLoad;
  }
  onLoadStarted?.();
  const loadPromise = loadWorkspaceNodeDocumentFromRuntime(nodeId);
  pendingNodeDocumentLoadById.set(nodeId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    if (pendingNodeDocumentLoadById.get(nodeId) === loadPromise) {
      pendingNodeDocumentLoadById.delete(nodeId);
    }
  }
}

function isCachedDocumentCurrent(nodeId: string, document: WorkspaceNodeDocument) {
  const nodeUpdatedAt = useWorkspaceStore.getState().nodesById[nodeId]?.updatedAt?.trim();
  const cachedUpdatedAt = document.updatedAt?.trim();
  return !nodeUpdatedAt || !cachedUpdatedAt || cachedUpdatedAt >= nodeUpdatedAt;
}

export function isWorkspaceNodeDocumentResultCurrent(
  nodeId: string,
  document: WorkspaceNodeDocument
) {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  if (!node || isDocumentOlderThanNode(document, normalizedUpdatedAt(node.updatedAt))) {
    return false;
  }
  const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
  return !cachedDocument || cachedDocument === document;
}

function isWorkspaceNodeDocumentApplied(nodeId: string, document: WorkspaceNodeDocument) {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  return Boolean(
    node
    && isNodeDocumentLoaded(node)
    && node.content === document.content
    && (node.hideTitleHeading ?? false) === document.hideTitleHeading
    && (node.imageRegions ?? null) === (document.imageRegions ?? null)
    && (node.imageSources ?? null) === (document.imageSources ?? null)
    && node.kind === document.kind
    && node.reveal === document.reveal
    && (node.virtualFilter ?? null) === (document.virtualFilter ?? null)
  );
}

export function discardCachedWorkspaceNodeDocumentResult(
  nodeId: string,
  document: WorkspaceNodeDocument
) {
  if (
    readCachedWorkspaceNodeDocument(nodeId) !== document
    || isWorkspaceNodeDocumentApplied(nodeId, document)
  ) {
    return;
  }
  removeCachedWorkspaceNodeDocument(nodeId);
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

  const baseline = captureWorkspaceNodeDocumentLoadBaseline(nodeId);
  const cachedDocument = options.forceLoad ? null : baseline.cachedDocument;
  const document = options.preloadedDocument
    ?? (cachedDocument && isCachedDocumentCurrent(nodeId, cachedDocument)
      ? cachedDocument
      : await loadWorkspaceNodeDocumentFromPendingRuntime(nodeId, options.onLoadStarted));
  if (!document || !isLoadResultCurrent(nodeId, document, baseline)) {
    return null;
  }
  writeCachedWorkspaceNodeDocument(nodeId, document);
  options.onLoadResolved?.(document);
  return document;
}

export function resetWorkspaceNodeDocumentLoaderForTest() {
  pendingNodeDocumentLoadById.clear();
}
