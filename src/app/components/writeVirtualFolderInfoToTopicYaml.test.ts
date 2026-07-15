import { beforeEach, expect, it, vi } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { writeVirtualFolderInfoToTopicYaml } from './writeVirtualFolderInfoToTopicYaml';

vi.mock('../../store/workspaceNodePreparation', () => ({
  ensureWorkspaceNodeDocumentReady: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  const initial = createInitialWorkspaceState(new Date('2026-07-15T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    nodeOrder: ['virtual-flow', 'topic-a', 'topic-b'],
    nodesById: {
      ...initial.nodesById,
      'virtual-flow': {
        content: '', createdAt: '2026-07-15T00:00:00.000Z', id: 'virtual-flow', isTitleManual: true,
        kind: 'folder', parentNodeId: 'special-virtual-root', reveal: null, review: null,
        specialKind: 'virtual', title: 'Flow', updatedAt: '2026-07-15T00:00:00.000Z',
        virtualFilter: createCollectionVirtualNodeFilter('Flow')
      },
      'topic-a': createTopic('topic-a'),
      'topic-b': createTopic('topic-b')
    },
    updateNodeContent: vi.fn(async () => true)
  });
});

it('force-loads matching Topics and idempotently merges the virtual folder collection', async () => {
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async (nodeId) => ({
    content: nodeId === 'topic-a' ? 'Body A' : '---\ncollections:\n  - Flow\n---\nBody B',
    hideTitleHeading: false,
    imageRegions: null,
    kind: 'topic',
    nodeId,
    reveal: null,
    virtualFilter: null
  }));

  await expect(writeVirtualFolderInfoToTopicYaml('virtual-flow')).resolves.toEqual({
    failed: 0,
    unchanged: 1,
    updated: 1
  });
  expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith('topic-a', { forceLoad: true });
  expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith('topic-b', { forceLoad: true });
  expect(useWorkspaceStore.getState().updateNodeContent).toHaveBeenCalledWith(
    'topic-a',
    expect.stringContaining('collections:\n  - "Flow"')
  );
});

it('reports a failed force load without hiding successful items', async () => {
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async (nodeId) => nodeId === 'topic-a' ? null : ({
    content: '---\ncollections:\n  - Flow\n---\nBody B', hideTitleHeading: false,
    imageRegions: null, kind: 'topic', nodeId, reveal: null, virtualFilter: null
  }));

  await expect(writeVirtualFolderInfoToTopicYaml('virtual-flow')).resolves.toEqual({
    failed: 1,
    unchanged: 1,
    updated: 0
  });
});

function createTopic(id: string) {
  return {
    collections: ['Flow'], content: '', createdAt: '2026-07-15T00:00:00.000Z', id,
    isTitleManual: true, kind: 'topic' as const, parentNodeId: null, reveal: null,
    review: null, title: id, updatedAt: '2026-07-15T00:00:00.000Z'
  };
}
