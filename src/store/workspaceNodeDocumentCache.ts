import type { Node } from '../features/nodes/model/nodeTypes';

import { isNodeDocumentLoaded, type WorkspaceNodeDocument } from './workspaceRendererBoundary';

const MAX_CACHED_NODE_DOCUMENT_BYTES = 200 * 1024;
const RECENT_HISTORY_PREFETCH_LIMIT = 12;
const ACTIVE_NEIGHBOR_PREFETCH_LIMIT = 24;
const VISIBLE_NODE_PREFETCH_LIMIT = 24;

const cachedNodeDocumentById = new Map<string, WorkspaceNodeDocument>();

let visiblePrefetchNodeIds: string[] = [];

function uniqueNodeIds(nodeIds: string[]) {
  return Array.from(new Set(nodeIds.filter(Boolean)));
}

function measureNodeDocumentBytes(document: WorkspaceNodeDocument) {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const encodeLength = (value: string | null | undefined) =>
    encoder ? encoder.encode(value ?? '').length : (value ?? '').length * 2;

  return encodeLength(document.content) + encodeLength(document.reveal);
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
  cachedNodeDocumentById.set(nodeId, document);
  return true;
}

export function removeCachedWorkspaceNodeDocument(nodeId: string) {
  cachedNodeDocumentById.delete(nodeId);
}

export function toWorkspaceNodeDocument(node: Node): WorkspaceNodeDocument {
  return {
    content: node.content,
    hideTitleHeading: node.hideTitleHeading ?? false,
    ...(node.imageRegions ? { imageRegions: node.imageRegions } : {}),
    kind: node.kind,
    reveal: node.reveal,
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

export function listWorkspaceNodeDocumentPrefetchCandidates(args: {
  activeNodeId: string | null;
  navigationBackStack: string[];
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  visibleNodeIds?: string[];
}) {
  return uniqueNodeIds([
    ...listHistoryPrefetchNodeIds(args.activeNodeId, args.navigationBackStack),
    ...listActiveNeighborPrefetchNodeIds(args.activeNodeId, args.nodeOrder, args.nodesById),
    ...(args.visibleNodeIds ?? [])
  ]).filter((nodeId) => nodeId !== args.activeNodeId);
}

export function resetWorkspaceNodeDocumentCacheForTest() {
  cachedNodeDocumentById.clear();
  visiblePrefetchNodeIds = [];
}
