export function mergeCollapsedNodeIds(
  autoCollapsedNodeIds: ReadonlySet<string>,
  manualCollapsedNodeIdList: string[],
  manualExpandedNodeIdList: string[]
) {
  const next = new Set(autoCollapsedNodeIds);
  for (const nodeId of manualCollapsedNodeIdList) {
    if (autoCollapsedNodeIds.has(nodeId)) {
      next.add(nodeId);
    }
  }
  for (const nodeId of manualExpandedNodeIdList) {
    next.delete(nodeId);
  }
  return next;
}

export function removeForcedExpandedNodeIds(
  collapsedNodeIds: ReadonlySet<string>,
  parentById: Record<string, string | null>,
  forceExpandedNodeId?: string | null
) {
  if (!forceExpandedNodeId) {
    return collapsedNodeIds;
  }
  const next = new Set(collapsedNodeIds);
  let currentNodeId: string | null = forceExpandedNodeId;
  while (currentNodeId) {
    next.delete(currentNodeId);
    currentNodeId = parentById[currentNodeId] ?? null;
  }
  return next;
}
