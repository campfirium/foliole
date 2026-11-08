interface VirtualTopicSnapshot {
  nodeOrder: string[];
  nodesById: Record<string, {
    kind: string;
    anchorLink?: unknown;
    shelvedAt?: string | null;
    specialKind?: unknown;
  }>;
  trashedNodeIds: string[];
}

export function collectShelvedTopicIds(args: VirtualTopicSnapshot) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node?.shelvedAt &&
        node.kind === 'topic' &&
        !node.anchorLink &&
        !node.specialKind &&
        !trashedNodeIds.has(nodeId)
    );
  });
}

export function collectRemovedTopicIds(args: VirtualTopicSnapshot) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node &&
        node.kind === 'topic' &&
        !node.anchorLink &&
        !node.specialKind &&
        trashedNodeIds.has(nodeId)
    );
  });
}
