import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest,
  writeCachedWorkspaceNodeDocument
} from './workspaceNodeDocumentCache';
import {
  loadWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentLoaderForTest
} from './workspaceNodeDocumentLoader';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

const CURRENT_UPDATED_AT = '2026-07-18T03:45:16.000Z';
const OLD_UPDATED_AT = '2026-07-18T03:44:00.000Z';
const NEW_UPDATED_AT = '2026-07-18T03:46:00.000Z';

function document(content: string, updatedAt?: string) {
  return {
    content,
    hideTitleHeading: false,
    kind: 'topic' as const,
    reveal: null,
    ...(updatedAt ? { updatedAt } : {}),
    virtualFilter: null
  };
}

function seedTrimmedNode(updatedAt = CURRENT_UPDATED_AT) {
  const initial = createInitialWorkspaceState(new Date('2026-07-18T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        ...initial.nodesById['node-1']!,
        content: '',
        hasContent: true,
        id: 'node-1',
        reveal: null,
        title: 'Updated title',
        updatedAt
      }
    },
    trashedNodeIds: []
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentCacheForTest();
  resetWorkspaceNodeDocumentLoaderForTest();
  seedTrimmedNode();
});

it('rejects an older cached body after workspace metadata advances', async () => {
  writeCachedWorkspaceNodeDocument('node-1', document('Old cached body', OLD_UPDATED_AT));
  const invoke = vi.fn().mockResolvedValue(document('Fresh runtime body', CURRENT_UPDATED_AT));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(loadWorkspaceNodeDocument('node-1', {})).resolves.toMatchObject({
    content: 'Fresh runtime body',
    updatedAt: CURRENT_UPDATED_AT
  });

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-1' });
  expect(readCachedWorkspaceNodeDocument('node-1')).toMatchObject({
    content: 'Fresh runtime body',
    updatedAt: CURRENT_UPDATED_AT
  });
});

it.each([
  ['the same version', CURRENT_UPDATED_AT, CURRENT_UPDATED_AT],
  ['a newer cache version', NEW_UPDATED_AT, CURRENT_UPDATED_AT],
  ['a cache without a version', undefined, CURRENT_UPDATED_AT],
  ['a node without a version', OLD_UPDATED_AT, '']
])('reuses %s without invoking the runtime', async (_label, cachedUpdatedAt, nodeUpdatedAt) => {
  seedTrimmedNode(nodeUpdatedAt);
  const cached = document('Reusable cached body', cachedUpdatedAt);
  writeCachedWorkspaceNodeDocument('node-1', cached);
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(loadWorkspaceNodeDocument('node-1', {})).resolves.toEqual(cached);

  expect(invoke).not.toHaveBeenCalled();
});
