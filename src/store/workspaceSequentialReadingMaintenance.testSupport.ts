import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

export const maintenanceTimestamp = '2026-10-03T00:00:00.000Z';

export function maintenanceNode(id: string, parentNodeId: string | null, state?: NodeReadingProfile['state']): Node {
  return {
    id, parentNodeId, kind: state ? 'topic' : 'folder', title: id,
    content: state ? 'Reading content' : '', hasContent: Boolean(state), reveal: null, review: null,
    createdAt: maintenanceTimestamp, updatedAt: maintenanceTimestamp,
    reading: state ? {
      state, intervalDurationMs: 1234, intervalGrowthFactor: 1.5,
      lastHandledAt: maintenanceTimestamp, nextAt: maintenanceTimestamp,
      priority: 5, readingPosition: 17, repetitionCount: 2
    } : null
  };
}

export function maintenanceTree(count = 100) {
  const nodesById: Record<string, Node> = {
    origin: maintenanceNode('origin', null),
    source: { ...maintenanceNode('source', 'origin', 'active'), sequentialReadingEnabled: true },
    destination: maintenanceNode('destination', null),
    moved: maintenanceNode('moved', 'destination')
  };
  for (let index = 0; index < count; index += 1) {
    const id = `reading-${index}`;
    nodesById[id] = maintenanceNode(id, 'moved', 'locked');
  }
  return {
    changedRootNodeIds: ['moved'], defaultPriority: 5 as const, nodesById,
    nodeOrder: Object.keys(nodesById), now: maintenanceTimestamp,
    previousNodesById: { ...nodesById, moved: { ...nodesById.moved!, parentNodeId: 'source' } }
  };
}
