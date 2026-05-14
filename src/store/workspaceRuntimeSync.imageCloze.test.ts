import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';

function createTopicNodeWithClearedImageRegions() {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic' as const,
    priority: null,
    desiredRetention: null,
    title: 'Parent',
    isTitleManual: false,
    hideTitleHeading: false,
    content: '![Cover](asset://hash-1.png)',
    virtualFilter: null,
    reveal: null,
    anchorLink: null,
    imageRegions: null,
    reading: null,
    review: null,
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:01.000Z'
  };
}

describe('workspaceRuntimeSync image cloze clearing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
  });

  it('sends cleared image regions as null instead of dropping the field', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createTopicNodeWithClearedImageRegions());

    expect(invoke).toHaveBeenCalledWith(
      'update_node_content',
      expect.objectContaining({
        imageRegions: null,
        nodeId: 'node-1'
      })
    );
  });

  it('clears stale image regions from pending snapshots when local sync says null', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createTopicNodeWithClearedImageRegions());

    expect(
      mergePendingNodeSyncIntoSnapshot({
        activeNodeId: 'node-1',
        nodeOrder: ['node-1'],
        nodesById: {
          'node-1': {
            ...createTopicNodeWithClearedImageRegions(),
            imageRegions: [
              {
                attachmentId: 'hash-1',
                regions: [{ id: 'region-1', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]
              }
            ]
          }
        },
        trashedNodeIds: []
      })?.nodesById['node-1']?.imageRegions
    ).toBeNull();

    await Promise.resolve();
    await Promise.resolve();
  });
});
