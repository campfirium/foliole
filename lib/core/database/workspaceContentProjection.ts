import type { WorkspaceSnapshot } from './workspaceSnapshot.js';
import type { WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

// Title changes can invalidate parent ordering. All fields not listed here require
// a complete snapshot, including newly introduced fields until their impact is known.
const CONTENT_FIELDS = new Set<string>([
  'bodyBlobHash', 'bodyStatus', 'content', 'currentVersionId', 'hasContent', 'hasReveal',
  'openingText', 'reveal', 'anchorLink', 'imageRegions', 'updatedAt', 'importContentFingerprint'
] satisfies Array<keyof WorkspaceNodeSnapshot>);

function structuralProjection(node: WorkspaceNodeSnapshot) {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !CONTENT_FIELDS.has(key)));
}

export function canMergeWorkspaceContentProjection(
  current: WorkspaceSnapshot,
  nodes: WorkspaceSnapshot['nodesById'],
  expectedNodeIds: readonly string[]
) {
  if (expectedNodeIds.some(id => !nodes[id])) return false;
  return Object.entries(nodes).every(([id, node]) => {
    const previous = current.nodesById[id];
    return previous !== undefined &&
      JSON.stringify(structuralProjection(previous)) === JSON.stringify(structuralProjection(node));
  });
}

/** The caller has checked structural equivalence against this exact baseline. */
export function mergeWorkspaceContentProjection(
  current: WorkspaceSnapshot, nodes: WorkspaceSnapshot['nodesById']
): WorkspaceSnapshot {
  const next = { ...current, nodesById: { ...current.nodesById, ...nodes } };
  // Text filters can change membership even when directory structure is unchanged.
  delete next.virtualResultIdsByNodeId;
  return next;
}
