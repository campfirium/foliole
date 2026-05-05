import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeOpening,
  WORKSPACE_LIST_OPENING_FALLBACK
} from '../../features/nodes/model/workspaceListNode';

function resolveNode(nodeId: string | null | undefined, nodesById?: Record<string, Node>) {
  if (!nodeId) {
    return null;
  }
  return nodesById?.[nodeId] ?? null;
}

export function resolveImportDisplayTitle(input: {
  fallbackTitle: string;
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  const node = resolveNode(input.nodeId, input.nodesById);
  return node?.title ?? input.fallbackTitle;
}

export function resolveImportDisplayAuthor(input: {
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  const node = resolveNode(input.nodeId, input.nodesById);
  return node ? getWorkspaceListNodeAuthor(node) : null;
}

export function resolveImportDisplayOpening(input: {
  fallbackOpening: string;
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  const node = resolveNode(input.nodeId, input.nodesById);
  if (!node) {
    return input.fallbackOpening;
  }

  const opening = getWorkspaceListNodeOpening(node);
  return opening === WORKSPACE_LIST_OPENING_FALLBACK ? input.fallbackOpening : opening;
}

export function resolveImportDisplayDate(input: {
  fallbackDate: string;
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  const node = resolveNode(input.nodeId, input.nodesById);
  return node ? getWorkspaceListNodeDateLabel(node) : input.fallbackDate;
}

export function resolveImportMetaLine(input: {
  fallbackPath: string;
  fallbackType: string;
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  const author = resolveImportDisplayAuthor(input);
  if (author) {
    return `${input.fallbackType} · ${author}`;
  }
  return `${input.fallbackType} · ${input.fallbackPath}`;
}

export function buildImportNodePresentation(input: {
  fallbackDate: string;
  fallbackOpening: string;
  fallbackPath: string;
  fallbackTitle: string;
  fallbackType: string;
  nodeId?: string | null;
  nodesById?: Record<string, Node>;
}) {
  return {
    date: resolveImportDisplayDate(input),
    meta: resolveImportMetaLine(input),
    opening: resolveImportDisplayOpening(input),
    title: resolveImportDisplayTitle(input)
  };
}
