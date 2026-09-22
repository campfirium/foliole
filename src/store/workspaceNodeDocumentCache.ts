import type { Node } from '../features/nodes/model/nodeTypes';

import { WorkspaceNodeDocumentRetentionCache } from './workspaceNodeDocumentRetentionCache';
import { isNodeDocumentLoaded, type WorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

const MAX_CACHED_NODE_DOCUMENT_BYTES = 200 * 1024;
const MAX_CACHED_NODE_DOCUMENTS = 256;
const RECENT_HISTORY_PREFETCH_LIMIT = 12;
const ACTIVE_NEIGHBOR_PREFETCH_LIMIT = 24;
const ACTIVE_ANCESTOR_PREFETCH_LIMIT = 8;
const VISIBLE_NODE_PREFETCH_LIMIT = 24;
const REVIEW_QUEUE_PREFETCH_LIMIT = 12;
const MAX_CACHED_NODE_DOCUMENT_TOTAL_BYTES = MAX_CACHED_NODE_DOCUMENTS * MAX_CACHED_NODE_DOCUMENT_BYTES;
const cachedNodeDocumentById = new WorkspaceNodeDocumentRetentionCache(
  MAX_CACHED_NODE_DOCUMENTS,
  MAX_CACHED_NODE_DOCUMENT_BYTES,
  MAX_CACHED_NODE_DOCUMENT_TOTAL_BYTES,
  measureNodeDocumentBytes
);

let visiblePrefetchNodeIds: string[] = [];

function uniqueNodeIds(nodeIds: string[]) {
  return Array.from(new Set(nodeIds.filter(Boolean)));
}

function measureNodeDocumentBytes(document: WorkspaceNodeDocument) {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const serialized = JSON.stringify(document);
  return encoder ? encoder.encode(serialized).length : serialized.length * 2;
}

export function shouldCacheWorkspaceNodeDocument(document: WorkspaceNodeDocument) {
  return measureNodeDocumentBytes(document) <= MAX_CACHED_NODE_DOCUMENT_BYTES;
}

export function readCachedWorkspaceNodeDocument(nodeId: string) {
  return cachedNodeDocumentById.get(nodeId) ?? null;
}

export function writeCachedWorkspaceNodeDocument(nodeId: string, document: WorkspaceNodeDocument) {
  if (!shouldCacheWorkspaceNodeDocument(document)) {
    cachedNodeDocumentById.delete(nodeId);
    return false;
  }
  return cachedNodeDocumentById.set(nodeId, document);
}

export function removeCachedWorkspaceNodeDocument(nodeId: string) {
  cachedNodeDocumentById.delete(nodeId);
}

export function toWorkspaceNodeDocument(node: Node): WorkspaceNodeDocument {
  return {
    content: node.content,
    hideTitleHeading: node.hideTitleHeading ?? false,
    imageRegions: node.imageRegions ?? null,
    imageSources: node.imageSources ?? null,
    kind: node.kind,
    reveal: node.reveal,
    updatedAt: node.updatedAt,
    virtualFilter: node.virtualFilter ?? null
  };
}

export function syncWorkspaceNodeDocumentCacheFromNode(node: Node | null | undefined) {
  if (!node) {
    return;
  }
  if (!isNodeDocumentLoaded(node)) {
    removeCachedWorkspaceNodeDocument(node.id);
    return;
  }
  writeCachedWorkspaceNodeDocument(node.id, toWorkspaceNodeDocument(node));
}

export function updateWorkspaceNodeDocumentRetentionPins(
  nodesById: Record<string, Node>,
  pinnedNodeIds: ReadonlySet<string>
) {
  const documents = new Map<string, WorkspaceNodeDocument>();
  for (const nodeId of pinnedNodeIds) {
    const node = nodesById[nodeId];
    if (node && isNodeDocumentLoaded(node)) {
      documents.set(nodeId, toWorkspaceNodeDocument(node));
    }
  }
  cachedNodeDocumentById.setPinnedDocuments(documents);
}

export function setVisibleWorkspaceNodeDocumentPrefetchNodeIds(nodeIds: string[]) {
  visiblePrefetchNodeIds = uniqueNodeIds(nodeIds).slice(0, VISIBLE_NODE_PREFETCH_LIMIT);
}

export function getVisibleWorkspaceNodeDocumentPrefetchNodeIds() {
  return visiblePrefetchNodeIds;
}

function listHistoryPrefetchNodeIds(activeNodeId: string | null, navigationBackStack: string[]) {
  return uniqueNodeIds([...navigationBackStack].reverse())
    .filter((nodeId) => nodeId !== activeNodeId)
    .slice(0, RECENT_HISTORY_PREFETCH_LIMIT);
}

function listActiveNeighborPrefetchNodeIds(
  activeNodeId: string | null,
  nodeOrder: string[],
  nodesById: Record<string, Node>
) {
  if (!activeNodeId) {
    return [];
  }

  const activeNode: Node | undefined = nodesById[activeNodeId];
  if (!activeNode) {
    return [];
  }

  const siblingNodeIds: string[] = [];
  const childNodeIds: string[] = [];

  for (const nodeId of nodeOrder) {
    if (nodeId === activeNodeId) {
      continue;
    }
    const node: Node | undefined = nodesById[nodeId];
    if (!node) {
      continue;
    }
    if (node.parentNodeId === activeNode.parentNodeId) {
      siblingNodeIds.push(nodeId);
      continue;
    }
    if (node.parentNodeId === activeNodeId) {
      childNodeIds.push(nodeId);
    }
  }

  return uniqueNodeIds([...siblingNodeIds, ...childNodeIds]).slice(0, ACTIVE_NEIGHBOR_PREFETCH_LIMIT);
}

function listActiveAncestorPrefetchNodeIds(activeNodeId: string | null, nodesById: Record<string, Node>) {
  if (!activeNodeId) {
    return [];
  }

  const ancestorNodeIds: string[] = [];
  const visitedNodeIds = new Set<string>([activeNodeId]);
  let cursorId = nodesById[activeNodeId]?.parentNodeId ?? null;

  while (cursorId && !visitedNodeIds.has(cursorId) && ancestorNodeIds.length < ACTIVE_ANCESTOR_PREFETCH_LIMIT) {
    visitedNodeIds.add(cursorId);
    ancestorNodeIds.push(cursorId);
    cursorId = nodesById[cursorId]?.parentNodeId ?? null;
  }

  return ancestorNodeIds;
}

export function listWorkspaceNodeDocumentPrefetchCandidates(args: {
  activeNodeId: string | null;
  navigationBackStack: string[];
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  reviewQueueNodeIds?: string[];
  visibleNodeIds?: string[];
}) {
  return uniqueNodeIds([
    ...listHistoryPrefetchNodeIds(args.activeNodeId, args.navigationBackStack),
    ...(args.reviewQueueNodeIds ?? []).filter((nodeId) => nodeId !== args.activeNodeId).slice(0, REVIEW_QUEUE_PREFETCH_LIMIT),
    ...listActiveAncestorPrefetchNodeIds(args.activeNodeId, args.nodesById),
    ...listActiveNeighborPrefetchNodeIds(args.activeNodeId, args.nodeOrder, args.nodesById),
    ...(args.visibleNodeIds ?? [])
  ]).filter((nodeId) => nodeId !== args.activeNodeId);
}

export function resetWorkspaceNodeDocumentCacheForTest() {
  cachedNodeDocumentById.clear();
  visiblePrefetchNodeIds = [];
}
