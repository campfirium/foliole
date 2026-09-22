import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { readCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { resetWorkspaceNodeDocumentPrefetchForTest } from '../../store/workspaceNodeDocumentPrefetch';
import { hasPendingNodeSync, stagePendingNodeSync } from '../../store/workspacePendingNodeSync';
import { createPendingNodeSnapshotFixture } from '../../store/workspacePendingNodeSyncReplay.testSupport';
import { getNodeDocumentStatus } from '../../store/workspaceRendererBoundary';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { useDocumentPanelDocumentRetry } from '../components/useDocumentPanelDocumentRetry';

import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

const loadedDocument = {
  content: 'Saved body', hideTitleHeading: false, kind: 'topic', reveal: null
};

function useReader() {
  const nodeId = useWorkspaceStore((state) => state.activeNodeId);
  useWorkspaceActiveNodeDocument(nodeId);
  return useDocumentPanelDocumentRetry(nodeId);
}

function readStatus(nodeId = 'node-1') {
  return getNodeDocumentStatus(useWorkspaceStore.getState().nodesById[nodeId]);
}

function deferredRead() {
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((_resolve, rejectRead) => { reject = rejectRead; });
  return { promise, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetWorkspaceNodeDocumentPrefetchForTest();
  const initial = createInitialWorkspaceState(new Date('2026-09-22T00:00:00.000Z'));
  const node = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial, activeNodeId: 'node-1', nodeOrder: ['node-1', 'node-2'], trashedNodeIds: [],
    nodesById: {
      'node-1': { ...node, id: 'node-1', content: '', hasContent: true, bodyStatus: 'fetching', reveal: null, hasReveal: false },
      'node-2': { ...node, id: 'node-2', content: '', hasContent: true, bodyStatus: 'fetching', reveal: null, hasReveal: false }
    }
  });
});

it('stops loading after failure and reads again only when Retry is requested', async () => {
  const invoke = vi.fn().mockRejectedValueOnce(new Error('cold read failed'))
    .mockRejectedValueOnce(new Error('retry failed')).mockResolvedValue(loadedDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const view = renderHook(useReader);
  await waitFor(() => expect(readStatus()).toBe('failed'));
  view.rerender();
  await act(async () => { await Promise.resolve(); });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(readCachedWorkspaceNodeDocument('node-1')).toBeNull();
  await act(async () => view.result.current.retryDocumentLoad());
  await waitFor(() => expect(view.result.current.isRetryingDocument).toBe(false));
  expect(readStatus()).toBe('failed');
  expect(invoke).toHaveBeenCalledTimes(2);
  await act(async () => view.result.current.retryDocumentLoad());
  await waitFor(() => expect(readStatus()).toBe('ready'));
  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Saved body');
  expect(invoke).toHaveBeenCalledTimes(3);
});

it('ignores a late failure after navigation to another document', async () => {
  const deferred = deferredRead();
  const invoke = vi.fn().mockReturnValueOnce(deferred.promise).mockResolvedValue(loadedDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  renderHook(useReader);
  act(() => useWorkspaceStore.getState().setActiveNode('node-2'));
  await waitFor(() => expect(readStatus('node-2')).toBe('ready'));
  await act(async () => deferred.reject(new Error('old document failed')));
  expect(readStatus('node-1')).not.toBe('failed');
  expect(readStatus('node-2')).toBe('ready');
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
});

it('keeps a newly edited body when the older read fails', async () => {
  const deferred = deferredRead();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(deferred.promise));
  renderHook(useReader);
  act(() => useWorkspaceStore.setState((state) => ({ nodesById: {
    ...state.nodesById,
    'node-1': { ...state.nodesById['node-1']!, content: 'Unsaved draft', bodyStatus: 'ready' }
  } })));
  await act(async () => deferred.reject(new Error('old read failed')));
  expect(readStatus()).toBe('ready');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Unsaved draft');
});

it('does not replace state belonging to an in-flight write', async () => {
  const deferred = deferredRead();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(deferred.promise));
  renderHook(useReader);
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ nodeId: 'node-1' }));
  expect(hasPendingNodeSync('node-1')).toBe(true);
  await act(async () => deferred.reject(new Error('read failed during write')));
  expect(hasPendingNodeSync('node-1')).toBe(true);
  expect(readStatus()).not.toBe('failed');
});

it('does not apply failure after its reader unmounts', async () => {
  const deferred = deferredRead();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(deferred.promise));
  const view = renderHook(useReader);
  view.unmount();
  await act(async () => deferred.reject(new Error('read failed after leaving')));
  expect(readStatus()).not.toBe('failed');
});
