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

function deferredDocument() {
  let resolve!: (value: ReturnType<typeof document>) => void;
  const promise = new Promise<ReturnType<typeof document>>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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

it('rejects a runtime body that becomes older than node metadata while loading', async () => {
  const deferred = deferredDocument();
  const invoke = vi.fn().mockReturnValue(deferred.promise);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const pendingLoad = loadWorkspaceNodeDocument('node-1', {});
  seedTrimmedNode(NEW_UPDATED_AT);
  deferred.resolve(document('Late runtime body', CURRENT_UPDATED_AT));

  await expect(pendingLoad).resolves.toBeNull();
  expect(readCachedWorkspaceNodeDocument('node-1')).toBeNull();
});

it('accepts a runtime body that catches up with metadata advanced while loading', async () => {
  const deferred = deferredDocument();
  const invoke = vi.fn().mockReturnValue(deferred.promise);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const pendingLoad = loadWorkspaceNodeDocument('node-1', {});
  seedTrimmedNode(NEW_UPDATED_AT);
  const currentDocument = document('Current runtime body', NEW_UPDATED_AT);
  deferred.resolve(currentDocument);

  await expect(pendingLoad).resolves.toBe(currentDocument);
  expect(readCachedWorkspaceNodeDocument('node-1')).toBe(currentDocument);
});

it('preserves a document cached while an unversioned runtime body is loading', async () => {
  seedTrimmedNode('');
  const deferred = deferredDocument();
  const invoke = vi.fn().mockReturnValue(deferred.promise);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const pendingLoad = loadWorkspaceNodeDocument('node-1', {});
  const currentDocument = document('Current local body');
  writeCachedWorkspaceNodeDocument('node-1', currentDocument);
  deferred.resolve(document('Late runtime body'));

  await expect(pendingLoad).resolves.toBeNull();
  expect(readCachedWorkspaceNodeDocument('node-1')).toBe(currentDocument);
});

it('shares runtime IO while validating each repeated request', async () => {
  const deferred = deferredDocument();
  const invoke = vi.fn().mockReturnValue(deferred.promise);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const firstLoad = loadWorkspaceNodeDocument('node-1', {});
  const secondLoad = loadWorkspaceNodeDocument('node-1', { forceLoad: true });
  const loadedDocument = document('Shared runtime body', CURRENT_UPDATED_AT);
  deferred.resolve(loadedDocument);

  await expect(firstLoad).resolves.toBe(loadedDocument);
  await expect(secondLoad).resolves.toBe(loadedDocument);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(readCachedWorkspaceNodeDocument('node-1')).toBe(loadedDocument);
});

it('clears a rejected pending read so a later request can retry', async () => {
  const invoke = vi.fn()
    .mockRejectedValueOnce(new Error('read failed'))
    .mockResolvedValueOnce(document('Retried body', CURRENT_UPDATED_AT));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(loadWorkspaceNodeDocument('node-1', {})).rejects.toThrow('read failed');
  await expect(loadWorkspaceNodeDocument('node-1', {})).resolves.toMatchObject({
    content: 'Retried body'
  });
  expect(invoke).toHaveBeenCalledTimes(2);
});
