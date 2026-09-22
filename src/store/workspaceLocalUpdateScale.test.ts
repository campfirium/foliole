import { expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => vi.fn())
}));

import { filterRootIdsByCandidates } from '../app/components/workspaceTopicTreeLazyModel';
import type { Node } from '../features/nodes/model/nodeTypes';
import { projectWorkspaceListNodesById } from '../features/nodes/model/workspaceListNode';
import { selectCanonicalReviewQueueSource } from '../shared/workspaceCanonicalSelectors';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';
import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

function createNode(id: string, specialKindRead: () => void): Node {
  const node: Node = {
    content: '', createdAt: '2026-09-22T00:00:00.000Z', hasContent: true,
    hasReveal: false, id, kind: 'topic', parentNodeId: null, reading: null,
    reveal: null, review: null, title: id, updatedAt: '2026-09-22T00:00:00.000Z'
  };
  Object.defineProperty(node, 'specialKind', {
    configurable: true,
    get: specialKindRead
  });
  return node;
}

it.each([10_000, 20_000, 100_000])(
  'keeps selection and body-only derivation work local at %i nodes',
  (nodeCount) => {
    let specialKindReads = 0;
    const nodeOrder = Array.from({ length: nodeCount }, (_, index) => `node-${index}`);
    const nodesById = Object.fromEntries(nodeOrder.map((nodeId) => [
      nodeId,
      createNode(nodeId, () => {
        specialKindReads += 1;
      })
    ]));
    expect(filterRootIdsByCandidates(nodeOrder, [...nodeOrder].reverse())).toEqual(nodeOrder);
    const current = createTestWorkspaceState({
      activeNodeId: 'node-0', nodeOrder, nodesById
    });

    const selected = withWorkspaceRendererBoundary(
      { activeNodeId: 'node-1' },
      current
    ) as Partial<typeof current>;
    expect(specialKindReads).toBeLessThan(10);

    const listProjection = projectWorkspaceListNodesById(nodesById);
    const reviewProjection = selectCanonicalReviewQueueSource({
      nodeOrder, nodesById, trashedNodeIds: current.trashedNodeIds
    });
    expect(projectWorkspaceListNodesById(selected.nodesById!, listProjection)).toBe(listProjection);
    const selectedReviewProjection = selectCanonicalReviewQueueSource({
      nodeOrder, nodesById: selected.nodesById!, trashedNodeIds: current.trashedNodeIds
    });
    expect(selectedReviewProjection.nodesById).toBe(reviewProjection.nodesById);

    const nextNodesById = patchWorkspaceRecord(selected.nodesById!, {
      'node-1': { ...selected.nodesById!['node-1']!, content: 'Loaded body' }
    });
    const loaded = withWorkspaceRendererBoundary(
      { activeNodeId: 'node-1', nodesById: nextNodesById },
      { ...current, activeNodeId: 'node-1', nodesById: selected.nodesById! }
    ) as Partial<typeof current>;

    expect(projectWorkspaceListNodesById(loaded.nodesById!, listProjection)).toBe(listProjection);
    expect(selectCanonicalReviewQueueSource({
      nodeOrder, nodesById: loaded.nodesById!, trashedNodeIds: current.trashedNodeIds
    }).nodesById).toBe(reviewProjection.nodesById);
  }
);
