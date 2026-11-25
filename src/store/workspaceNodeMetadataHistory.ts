import { z } from 'zod';


import { hashTextBody } from '../../lib/core/database/textBodyHash';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { READING_STATES } from '../../lib/core/review/readingState';
import { canNodeAcceptMovedNode, canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';

import { workspaceHistorySessionSchema } from './workspaceHistorySessionSchema';

export const workspaceHistoryReadingSchema = z.object({ intervalDurationMs: z.number(), intervalGrowthFactor: z.number(),
  lastHandledAt: z.string(), nextAt: z.string(), priority: z.number(), readingPosition: z.number(),
  repetitionCount: z.number(), state: z.enum(READING_STATES) });

const fields = z.object({ title: z.string(), isTitleManual: z.boolean(), parentNodeId: z.string().nullable(),
  deletedAt: z.string().nullable(), shelvedAt: z.string().nullable(), priority: z.number().nullable().optional(),
  // A manual index's source list, recorded only when the change edits it.
  manualChildOrder: z.array(z.string()).nullable().optional(),
  // A branch's own review options, recorded only when the change edits them.
  desiredRetention: z.number().nullable().optional(), enableShortTerm: z.boolean().nullable().optional(), enforcePriority: z.boolean().optional() });
export const workspaceRelatedReadingSchema = z.object({ nodeId: z.string(), beforeReading: workspaceHistoryReadingSchema.nullable(), afterReading: workspaceHistoryReadingSchema.nullable() });
export type WorkspaceRelatedReading = z.infer<typeof workspaceRelatedReadingSchema>;

export const workspaceNodeMetadataHistorySchema = z.object({
  beforeSession: workspaceHistorySessionSchema.nullable().default(null),
  afterSession: workspaceHistorySessionSchema.nullable().default(null),
  // A parent's order-source fingerprint; older entries kept complete child lists instead.
  orders: z.array(z.union([z.object({ parentId: z.string(), sources: z.string() }),
    z.object({ parentId: z.string(), before: z.array(z.string()), after: z.array(z.string()) })])).default([]),
  type: z.literal('nodes.change'), id: z.string(), title: z.string(),
  rootNodeId: z.string(), relatedReadings: z.array(workspaceRelatedReadingSchema).default([]), subtreeNodeIds: z.array(z.string()).nullable(),
  changes: z.array(z.object({ nodeId: z.string(), before: fields.nullable(), after: fields,
    creationContent: z.string().nullable() }))
});
export type WorkspaceNodeMetadataHistoryEntry = z.infer<typeof workspaceNodeMetadataHistorySchema>;

export function workspaceNodeMetadata(node: WorkspaceNodeSnapshot, includePriority = false, includeManualChildOrder = false,
  includeReviewOptions = false, includeEnforcement = false) {
  return { title: node.title, isTitleManual: node.isTitleManual, parentNodeId: node.parentNodeId,
    deletedAt: node.deletedAt ?? null, shelvedAt: node.shelvedAt ?? null, ...(includePriority ? { priority: node.priority ?? null } : {}),
    ...(includeManualChildOrder ? { manualChildOrder: node.manualChildOrder ?? null } : {}),
    ...(includeReviewOptions ? { desiredRetention: node.desiredRetention ?? null, enableShortTerm: node.enableShortTerm ?? null } : {}),
    ...(includeEnforcement ? { enforcePriority: node.enforcePriority === true } : {}) };
}

export function collectWorkspaceMetadataSubtree(rootId: string, nodes: Record<string, WorkspaceNodeSnapshot>) {
  const result = new Set([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const node of Object.values(nodes)) if (node.parentNodeId && result.has(node.parentNodeId) && !result.has(node.id)) {
      result.add(node.id);
      added = true;
    }
  }
  return [...result];
}

export function assertWorkspaceMetadataParent(node: WorkspaceNodeSnapshot, parentId: string | null,
  nodes: Record<string, WorkspaceNodeSnapshot>) {
  assertWorkspaceMetadataParentWithSubtree(node, parentId, nodes);
}

function assertWorkspaceMetadataParentWithSubtree(node: WorkspaceNodeSnapshot, parentId: string | null,
  nodes: Record<string, WorkspaceNodeSnapshot>, subtreeIds?: ReadonlySet<string>) {
  if (parentId === null) {
    if (node.kind !== 'folder') throw new Error('node_parent_required');
    return;
  }
  const parent = nodes[parentId];
  if (!parent || parent.deletedAt || parentId === 'special-home' || parentId === 'special-virtual-root' || parent.virtualFilter ||
    !canCreateChildNodeKind(parent.kind, node.kind)) throw new Error('node_parent_unavailable');
  if (nodes[node.id] && (!canNodeBeMoved(node) || !canNodeAcceptMovedNode(parent, node))) throw new Error('node_move_unavailable');
  if ((subtreeIds ?? new Set(collectWorkspaceMetadataSubtree(node.id, nodes))).has(parentId)) throw new Error('node_parent_cycle');
}

export function listWorkspaceMetadataParents(node: WorkspaceNodeSnapshot, nodes: Record<string, WorkspaceNodeSnapshot>) {
  const subtreeIds = new Set(collectWorkspaceMetadataSubtree(node.id, nodes));
  return Object.values(nodes).filter(parent => {
    try { assertWorkspaceMetadataParentWithSubtree(node, parent.id, nodes, subtreeIds); return true; } catch { return false; }
  });
}

export function resolveWorkspaceMetadataHistory(entry: WorkspaceNodeMetadataHistoryEntry, mode: 'undo' | 'redo',
  nodes: Record<string, WorkspaceNodeSnapshot>, now: string) {
  if (entry.subtreeNodeIds) {
    const created = entry.changes.some(change => change.before === null);
    const current = collectWorkspaceMetadataSubtree(entry.rootNodeId, nodes)
      .filter(id => !created || id === entry.rootNodeId || !nodes[id]?.deletedAt);
    if (current.length !== entry.subtreeNodeIds.length || current.some(id => !entry.subtreeNodeIds!.includes(id))) {
      throw new Error('workspace_history_subtree_changed');
    }
  }
  const targets = entry.changes.map(change => {
    const node = nodes[change.nodeId];
    if (!node) throw new Error('workspace_history_node_missing');
    const source = mode === 'undo' ? change.after : change.before;
    const target = mode === 'undo' ? change.before : change.after;
    const current = workspaceNodeMetadata(node, source?.priority !== undefined, source?.manualChildOrder !== undefined,
      source?.desiredRetention !== undefined, source?.enforcePriority !== undefined);
    if (source ? JSON.stringify(current) !== JSON.stringify(source) : !node.deletedAt ||
      JSON.stringify({ ...current, deletedAt: null }) !== JSON.stringify({ ...change.after, deletedAt: null })) throw new Error('workspace_history_changed');
    if (!change.before && change.creationContent !== hashTextBody(JSON.stringify([node.content, node.reveal]))) throw new Error('workspace_history_content_changed');
    const { priority, enforcePriority, manualChildOrder, desiredRetention, enableShortTerm, ...metadata } = target ?? change.after;
    const next = { ...node, ...metadata, ...(priority === undefined ? {} : { priority }),
      ...(enforcePriority === undefined ? {} : { enforcePriority }),
      ...(manualChildOrder === undefined ? {} : { manualChildOrder }),
      ...(desiredRetention === undefined ? {} : { desiredRetention, enableShortTerm: enableShortTerm ?? null }),
      deletedAt: target ? target.deletedAt : now, updatedAt: now };
    if (!next.deletedAt && next.parentNodeId !== node.parentNodeId) assertWorkspaceMetadataParent(next, next.parentNodeId, nodes);
    return next;
  });
  const projected = { ...nodes, ...Object.fromEntries(targets.map(node => [node.id, node])) };
  for (const node of targets) if (!node.deletedAt && node.parentNodeId && (!projected[node.parentNodeId] || projected[node.parentNodeId]?.deletedAt)) {
    throw new Error('workspace_history_parent_unavailable');
  }
  return targets;
}
