import { expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';

import { syncNodeContentWithAnchorsToRuntime } from './workspaceRuntimeSync';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    priority: 0,
    desiredRetention: 0.81,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    anchorLink: null,
    imageRegions: null,
    reveal: 'Reveal',
    reading: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

it('sends parent and affected anchor updates through one batch command', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const parentNode = createNodeFixture();
  const childNode = {
    ...createNodeFixture(),
    id: 'node-2',
    parentNodeId: 'node-1',
    content: 'Child',
    title: 'Child',
    updatedAt: '2026-03-06T00:00:02.000Z'
  };

  syncNodeContentWithAnchorsToRuntime(parentNode, [childNode], ['node-1', 'node-2']);
  await Promise.resolve();

  expect(invoke).toHaveBeenCalledWith('update_node_content_with_anchors', {
    parent: expect.objectContaining({ nodeId: 'node-1', position: 0 }),
    affectedAnchors: [expect.objectContaining({ nodeId: 'node-2', position: 1 })]
  });
});
