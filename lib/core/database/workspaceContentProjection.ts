import { parentOrderId } from './parentChildOrder.js';
import type { WorkspaceSnapshot } from './workspaceSnapshot.js';
import type { WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';
import { workspaceSnapshotValueEqual } from './workspaceSnapshotValueEqual.js';

// Title changes can invalidate parent ordering. All fields not listed here require
// a complete snapshot, including newly introduced fields until their impact is known.
const CONTENT_FIELDS = new Set<string>([
  'bodyBlobHash', 'bodyStatus', 'content', 'currentVersionId', 'hasContent', 'hasReveal',
  'openingText', 'reveal', 'anchorLink', 'imageRegions', 'updatedAt', 'importContentFingerprint'
] satisfies Array<keyof WorkspaceNodeSnapshot>);

function structuralProjection(node: WorkspaceNodeSnapshot, reviewed: boolean, reading: boolean) {
  return Object.fromEntries(Object.entries(node).filter(([key]) =>
    !CONTENT_FIELDS.has(key) && !(reviewed && key === 'review') && !(reading && key === 'reading')));
}

/** Learning scopes permit profile changes only for nodes whose local writes committed. */
export function canMergeWorkspaceContentProjection(
  current: WorkspaceSnapshot,
  nodes: WorkspaceSnapshot['nodesById'],
  expectedNodeIds: readonly string[],
  reviewedNodeIds: readonly string[] = [],
  readingNodeIds: readonly string[] = []
) {
  if (expectedNodeIds.some(id => !nodes[id])) return false;
  const reviewed = new Set(reviewedNodeIds);
  const reading = new Set(readingNodeIds);
  return Object.entries(nodes).every(([id, node]) => {
    const previous = current.nodesById[id];
    return previous !== undefined && workspaceSnapshotValueEqual(
      structuralProjection(previous, reviewed.has(id), reading.has(id)),
      structuralProjection(node, reviewed.has(id), reading.has(id)));
  });
}

/**
 * Accepts a structural change only when nodes move into Trash: each changed node keeps every
 * structural fact except gaining `deletedAt`, and every baseline child of a newly trashed node
 * was read too. Anything else, including restores and moves, needs a complete snapshot.
 */
export function canMergeWorkspaceTrashProjection(
  current: WorkspaceSnapshot,
  nodes: WorkspaceSnapshot['nodesById'],
  expectedNodeIds: readonly string[],
  reviewedNodeIds: readonly string[] = [],
  readingNodeIds: readonly string[] = []
) {
  if (expectedNodeIds.some(id => !nodes[id])) return false;
  const reviewed = new Set(reviewedNodeIds);
  const reading = new Set(readingNodeIds);
  const trashed = new Set<string>();
  for (const [id, node] of Object.entries(nodes)) {
    const previous = current.nodesById[id];
    if (!previous) return false;
    const before = structuralProjection(previous, reviewed.has(id), reading.has(id));
    const after = structuralProjection(node, reviewed.has(id), reading.has(id));
    if (!previous.deletedAt && node.deletedAt) {
      trashed.add(id);
      delete before.deletedAt;
      delete after.deletedAt;
    }
    if (!workspaceSnapshotValueEqual(before, after)) return false;
  }
  return trashed.size > 0 && Object.values(current.nodesById)
    .every(node => node.parentNodeId === null || !trashed.has(node.parentNodeId) || nodes[node.id] !== undefined);
}

// Metadata writes may change these facts; the merge re-derives the order of every parent they touch.
const METADATA_FIELDS = ['title', 'isTitleManual', 'parentNodeId', 'deletedAt', 'priority', 'shelvedAt'] as const;
const ORDER_FIELDS = ['title', 'parentNodeId', 'createdAt', 'deletedAt'] as const;

/**
 * Accepts metadata writes confined to the named nodes: creations, renames, moves, restores, moves to Trash,
 * priority and shelving. Every baseline child of a named node must have been read too.
 */
export function canMergeWorkspaceMetadataProjection(
  current: WorkspaceSnapshot,
  nodes: WorkspaceSnapshot['nodesById'],
  expectedNodeIds: readonly string[],
  reviewedNodeIds: readonly string[] = [],
  readingNodeIds: readonly string[] = []
) {
  if (expectedNodeIds.some(id => !nodes[id])) return false;
  const reviewed = new Set(reviewedNodeIds);
  const reading = new Set(readingNodeIds);
  return Object.entries(nodes).every(([id, node]) => {
    const previous = current.nodesById[id];
    if (!previous) return true;
    const before = structuralProjection(previous, reviewed.has(id), reading.has(id));
    const after = structuralProjection(node, reviewed.has(id), reading.has(id));
    for (const field of METADATA_FIELDS) { delete before[field]; delete after[field]; }
    return workspaceSnapshotValueEqual(before, after);
  });
}

/**
 * Parents (`parentOrderId` keys) whose children a metadata merge must order again: the old and new parents of
 * every node whose order facts changed, and every node that appears or reappears together with its descendants.
 */
export function workspaceMetadataOrderParents(
  current: WorkspaceSnapshot, nodesById: WorkspaceSnapshot['nodesById'], changed: WorkspaceSnapshot['nodesById']
) {
  const parents = new Set<string>();
  const appeared: string[] = [];
  for (const [id, node] of Object.entries(changed)) {
    const previous = current.nodesById[id];
    if (previous && ORDER_FIELDS.every(field => (previous[field] ?? null) === (node[field] ?? null))) continue;
    if (previous) parents.add(parentOrderId(previous.parentNodeId));
    parents.add(parentOrderId(node.parentNodeId));
    if (!previous || (previous.deletedAt ?? null) !== (node.deletedAt ?? null)) appeared.push(id);
  }
  if (!appeared.length) return parents;
  // Children hidden under a node that reappears are absent from the previous order, so they are ordered again too.
  const children = new Map<string, string[]>();
  for (const node of Object.values(nodesById)) {
    if (node.parentNodeId === null) continue;
    const siblings = children.get(node.parentNodeId);
    if (siblings) siblings.push(node.id);
    else children.set(node.parentNodeId, [node.id]);
  }
  const seen = new Set<string>();
  const pending = [...appeared];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    parents.add(id);
    pending.push(...children.get(id) ?? []);
  }
  return parents;
}

/** The caller has checked structural equivalence against this exact baseline. */
export function mergeWorkspaceContentProjection(
  current: WorkspaceSnapshot, nodes: WorkspaceSnapshot['nodesById']
): WorkspaceSnapshot {
  const changed = Object.entries(nodes).filter(([id, node]) => !workspaceSnapshotValueEqual(current.nodesById[id], node));
  if (!changed.length) return current;
  const next = { ...current, nodesById: { ...current.nodesById, ...Object.fromEntries(changed) } };
  // Text filters can change membership even when directory structure is unchanged.
  delete next.virtualResultIdsByNodeId;
  return next;
}
