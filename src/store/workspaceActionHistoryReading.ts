import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

export interface RelatedHistoryReadingApply {
  expectedReading: NodeReadingProfile | null;
  nextReading: NodeReadingProfile | null;
  nodeId: string;
}

export function cloneReadingProfile(reading: NodeReadingProfile | null | undefined): NodeReadingProfile | null {
  return reading ? { ...reading } : null;
}

export function isSameReadingProfile(
  left: NodeReadingProfile | null | undefined,
  right: NodeReadingProfile | null | undefined
) {
  const a = left ?? null;
  const b = right ?? null;
  if (!a || !b) {
    return a === b;
  }
  return (
    a.intervalDurationMs === b.intervalDurationMs &&
    a.intervalGrowthFactor === b.intervalGrowthFactor &&
    a.lastHandledAt === b.lastHandledAt &&
    a.nextAt === b.nextAt &&
    a.priority === b.priority &&
    a.readingPosition === b.readingPosition &&
    a.repetitionCount === b.repetitionCount &&
    a.state === b.state
  );
}

export function applyReadingSnapshot(node: Node, reading: NodeReadingProfile | null, now: string): Node {
  return {
    ...node,
    reading: cloneReadingProfile(reading),
    updatedAt: now
  };
}

export function cloneRelatedReadings<T extends { afterReading: NodeReadingProfile | null | undefined; beforeReading: NodeReadingProfile | null | undefined; nodeId: string }>(
  readings: T[] | null | undefined
) {
  return readings?.map((reading) => ({
    afterReading: cloneReadingProfile(reading.afterReading),
    beforeReading: cloneReadingProfile(reading.beforeReading),
    nodeId: reading.nodeId
  }));
}

export function areRelatedReadingsValid(
  readings: RelatedHistoryReadingApply[],
  nodesById: Record<string, Node | undefined>
) {
  return readings.every((reading) => {
    const relatedNode = nodesById[reading.nodeId];
    return relatedNode && isSameReadingProfile(relatedNode.reading, reading.expectedReading);
  });
}

export function applyRelatedReadingSnapshots(args: {
  nextNodesById: Record<string, Node | undefined>;
  now: string;
  readings: RelatedHistoryReadingApply[];
}) {
  for (const reading of args.readings) {
    const relatedNode = args.nextNodesById[reading.nodeId];
    if (relatedNode) {
      args.nextNodesById[reading.nodeId] = applyReadingSnapshot(relatedNode, reading.nextReading, args.now);
    }
  }
}
