export function createPendingNodeSnapshotFixture(args?: {
  nodeId?: string;
  parentNodeId?: string | null;
  title?: string;
  updatedAt?: string;
}) {
  return {
    nodeId: args?.nodeId ?? 'node-1',
    parentNodeId: args?.parentNodeId ?? null,
    kind: 'topic' as const,
    priority: 0,
    desiredRetention: 0.81,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    title: args?.title ?? 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    virtualFilter: null,
    reveal: 'Reveal',
    anchorLink: null,
    imageRegions: null,
    reading: null,
    review: null,
    position: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: args?.updatedAt ?? '2026-03-06T00:00:01.000Z'
  };
}

export function createRuntimeNodeSnapshotFixture(args?: {
  currentVersionId?: string | null;
  deletedAt?: string | null;
  nodeId?: string;
  parentNodeId?: string | null;
  title?: string;
  updatedAt?: string;
}) {
  const pendingNode = createPendingNodeSnapshotFixture(args);
  return {
    id: pendingNode.nodeId,
    parentNodeId: pendingNode.parentNodeId,
    kind: pendingNode.kind,
    priority: pendingNode.priority,
    desiredRetention: pendingNode.desiredRetention,
    enableShortTerm: pendingNode.enableShortTerm,
    sequentialReadingEnabled: pendingNode.sequentialReadingEnabled,
    title: args?.title ?? 'Runtime',
    isTitleManual: pendingNode.isTitleManual,
    hideTitleHeading: pendingNode.hideTitleHeading,
    content: '# Runtime',
    ...(args?.currentVersionId !== undefined ? { currentVersionId: args.currentVersionId } : {}),
    reveal: pendingNode.reveal,
    anchorLink: pendingNode.anchorLink,
    imageRegions: pendingNode.imageRegions,
    reading: pendingNode.reading,
    review: pendingNode.review,
    createdAt: pendingNode.createdAt,
    ...(args?.deletedAt !== undefined ? { deletedAt: args.deletedAt } : {}),
    updatedAt: args?.updatedAt ?? '2026-03-06T00:00:02.000Z'
  };
}
