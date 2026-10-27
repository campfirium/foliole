interface ManualItemCandidate {
  anchorLink: unknown;
  kind: string;
  parentNodeId: string | null;
}

/** Uses existing node kind and direct containment; it adds no persisted ownership identity. */
export function isManualItemAtFolderLevel(node: ManualItemCandidate, parentKind?: string) {
  return node.kind === 'item' && !node.anchorLink &&
    (node.parentNodeId === null || node.parentNodeId === 'special-inbox' || parentKind === 'folder');
}
