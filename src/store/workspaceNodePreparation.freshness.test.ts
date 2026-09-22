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
import { resetWorkspaceNodeDocumentLoaderForTest } from './workspaceNodeDocumentLoader';
import {
  ensureWorkspaceNodeDocumentReady,
  openWorkspaceNodeWithPreparedDocument
} from './workspaceNodePreparation';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

const CURRENT_UPDATED_AT = '2026-09-22T01:00:00.000Z';
const NEW_UPDATED_AT = '2026-09-22T01:01:00.000Z';

function document(content: string, updatedAt = CURRENT_UPDATED_AT): WorkspaceNodeDocument {
  return {
    content,
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    updatedAt,
    virtualFilter: null
  };
}

function deferredDocument() {
  let resolve!: (value: WorkspaceNodeDocument) => void;
  const promise = new Promise<WorkspaceNodeDocument>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function seedWorkspace() {
  const initial = createInitialWorkspaceState(new Date('2026-09-22T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        bodyStatus: 'ready',
        content: 'Loaded node 1 body',
        hasContent: true,
        id: 'node-1',
        reveal: null,
        updatedAt: CURRENT_UPDATED_AT
      },
      'node-2': {
        ...seedNode,
        bodyStatus: 'fetching',
        content: '',
        hasContent: true,
        id: 'node-2',
        reveal: null,
        updatedAt: CURRENT_UPDATED_AT
      }
    },
    trashedNodeIds: []
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentCacheForTest();
  resetWorkspaceNodeDocumentLoaderForTest();
  seedWorkspace();
});

it('does not merge or report a body superseded after its runtime read resolves', async () => {
  const lateDocument = document('Late runtime body');
  const currentDocument = document('Current synced body', NEW_UPDATED_AT);
  const onDocumentMerged = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(lateDocument));

  const result = await ensureWorkspaceNodeDocumentReady('node-2', {
    onDocumentMerged,
    onLoadResolved: () => {
      useWorkspaceStore.setState((state) => ({
        nodesById: {
          ...state.nodesById,
          'node-2': { ...state.nodesById['node-2']!, updatedAt: NEW_UPDATED_AT }
        }
      }));
      writeCachedWorkspaceNodeDocument('node-2', currentDocument);
    }
  });

  expect(result).toBeNull();
  expect(onDocumentMerged).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().nodesById['node-2']?.content).toBe('');
  expect(readCachedWorkspaceNodeDocument('node-2')).toBe(currentDocument);
});

it('can apply a current selection without applying its superseded document', async () => {
  const lateDocument = document('Late runtime body');
  const currentDocument = document('Current synced body', NEW_UPDATED_AT);
  const onDocumentMerged = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(lateDocument));

  const result = await openWorkspaceNodeWithPreparedDocument('node-2', {
    onDocumentMerged,
    onLoadResolved: () => {
      useWorkspaceStore.setState((state) => ({
        nodesById: {
          ...state.nodesById,
          'node-2': { ...state.nodesById['node-2']!, updatedAt: NEW_UPDATED_AT }
        }
      }));
      writeCachedWorkspaceNodeDocument('node-2', currentDocument);
    }
  });

  expect(result).toEqual({ focusAnchor: null, nodeId: 'node-2' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(useWorkspaceStore.getState().nodesById['node-2']?.content).toBe('');
  expect(readCachedWorkspaceNodeDocument('node-2')).toBe(currentDocument);
  expect(onDocumentMerged).not.toHaveBeenCalled();
});

it('does not cache, merge, or select a node removed during its read', async () => {
  const deferred = deferredDocument();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(deferred.promise));

  const pendingOpen = openWorkspaceNodeWithPreparedDocument('node-2');
  useWorkspaceStore.setState((state) => {
    const nodesById = { ...state.nodesById };
    delete nodesById['node-2'];
    return { nodeOrder: ['node-1'], nodesById };
  });
  deferred.resolve(document('Removed node body'));

  await expect(pendingOpen).resolves.toBeNull();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
  expect(readCachedWorkspaceNodeDocument('node-2')).toBeNull();
});

it('does not let forceLoad replace a local document updated during the read', async () => {
  const deferred = deferredDocument();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(deferred.promise));

  const pendingEnsure = ensureWorkspaceNodeDocumentReady('node-1', { forceLoad: true });
  const localDocument = document('Current local draft', NEW_UPDATED_AT);
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1']!,
        content: localDocument.content,
        updatedAt: NEW_UPDATED_AT
      }
    }
  }));
  writeCachedWorkspaceNodeDocument('node-1', localDocument);
  deferred.resolve(document('Late forced body'));

  await expect(pendingEnsure).resolves.toBeNull();
  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Current local draft');
  expect(readCachedWorkspaceNodeDocument('node-1')).toBe(localDocument);
});
