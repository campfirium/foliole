import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';

const syncObjectsMock = vi.hoisted(() => ({
  applyCompanionSyncNodeVersions: vi.fn(async () => ['topic-1'])
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createNode(overrides: Partial<WorkspaceSnapshot['nodesById'][string]> = {}) {
  return {
    anchorLink: null,
    content: 'Original body',
    createdAt: '2026-05-03T00:00:00.000Z',
    currentVersionId: 'desktop#topic-v1',
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic' as const,
    openingText: null,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  let uuidIndex = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidIndex += 1;
    return `00000000-0000-4000-8000-${uuidIndex.toString().padStart(12, '0')}`;
  });
});

it('preserves image excerpt regions while relocating the markdown image occurrence', async () => {
  const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');
  const image = '![Cover](asset://hash-1.png)';
  const imageRegions = [{
    attachmentId: 'hash-1',
    regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }]
  }];
  const parent = createNode({ content: image });
  const child = createNode({
    anchorLink: {
      id: 'excerpt-1', kind: 'image-excerpt',
      locator: { from: 0, originalText: image, to: image.length }
    },
    content: '![Image excerpt](asset://crop.png)',
    currentVersionId: 'desktop#child-v1',
    id: 'child-1',
    imageRegions,
    parentNodeId: 'topic-1'
  });
  const snapshot: WorkspaceSnapshot = {
    activeNodeId: parent.id,
    nodeOrder: [parent.id, child.id],
    nodesById: { [parent.id]: parent, [child.id]: child },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };

  const result = await persistCompanionTopicContent({
    content: `Lead\n${image}`,
    deviceId: 'ios-device',
    nodeId: parent.id,
    snapshot
  });
  const calls = syncObjectsMock.applyCompanionSyncNodeVersions.mock.calls as unknown as Array<[NativeSyncNodeRecord[]]>;
  const appliedVersions = calls[0]?.[0];

  expect(result?.snapshot.nodesById['child-1']).toMatchObject({
    anchorLink: expect.objectContaining({ locator: expect.objectContaining({ from: 5 }) }),
    imageRegions
  });
  expect(appliedVersions?.[1]?.snapshot.image_regions).toBe(JSON.stringify(imageRegions));
});
