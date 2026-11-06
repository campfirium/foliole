import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useNodeBacklinks } from './useNodeBacklinks';

const runtime = vi.hoisted(() => ({
  load: vi.fn(), changed: null as null | ((payload: { libraryScope?: string }) => void),
  synced: null as null | ((payload: { libraryScope?: string }) => void), unlisten: vi.fn()
}));
vi.mock('../../shared/platform/nodeBacklinksRuntimeRepository', () => ({ loadRuntimeNodeBacklinks: runtime.load }));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceContentChanged: async (callback: NonNullable<typeof runtime.changed>) => {
    runtime.changed = callback; return runtime.unlisten;
  },
  onWorkspaceSyncApplied: async (callback: NonNullable<typeof runtime.synced>) => {
    runtime.synced = callback; return runtime.unlisten;
  }
}));

const item = (sourceTitle: string): BacklinkItem[] => [{ sourceNodeId: 'source', sourceTitle, context: sourceTitle, matchCount: 1 }];
function deferred() {
  let resolve!: (value: BacklinkItem[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BacklinkItem[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function hook(targetNodeId = 'target') {
  return renderHook(({ target }) => useNodeBacklinks({ targetNodeId: target, nodesById: {}, nodeOrder: [], trashedNodeIds: [] }),
    { initialProps: { target: targetNodeId } });
}

beforeEach(() => {
  runtime.load.mockReset(); runtime.unlisten.mockClear(); runtime.changed = null; runtime.synced = null;
  useWorkspaceStore.setState({ libraryScope: 'library-a' });
});

it('keeps the last saved result while refreshing and rejects an earlier request after another save', async () => {
  runtime.load.mockResolvedValueOnce(item('Saved'));
  const view = hook();
  await waitFor(() => expect(view.result.current.value).toEqual(item('Saved')));
  const old = deferred(), latest = deferred();
  runtime.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  act(() => runtime.changed?.({ libraryScope: 'library-a' }));
  expect(view.result.current.value).toEqual(item('Saved'));
  act(() => runtime.changed?.({ libraryScope: 'library-a' }));
  await act(async () => latest.resolve(item('Latest saved')));
  await act(async () => old.resolve(item('Earlier saved')));
  expect(view.result.current.value).toEqual(item('Latest saved'));
});

it('keeps errors retryable and prevents a late failure from overriding a successful refresh', async () => {
  runtime.load.mockRejectedValueOnce(new Error('interrupted'));
  const view = hook();
  await waitFor(() => expect(view.result.current.errorMessage).toBeTruthy());
  runtime.load.mockResolvedValueOnce(item('Retried'));
  act(() => view.result.current.retry());
  await waitFor(() => expect(view.result.current.value).toEqual(item('Retried')));
  const old = deferred();
  runtime.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(item('Synced'));
  act(() => runtime.changed?.({ libraryScope: 'library-a' }));
  act(() => runtime.synced?.({ libraryScope: 'library-a' }));
  await waitFor(() => expect(view.result.current.value).toEqual(item('Synced')));
  await act(async () => old.reject(new Error('late error')));
  expect(view.result.current.errorMessage).toBe('');
  expect(view.result.current.value).toEqual(item('Synced'));
});

it('does not accept replies for another target or a previous library with the same target ID', async () => {
  const target = deferred(), library = deferred();
  runtime.load.mockReturnValueOnce(target.promise).mockReturnValueOnce(library.promise).mockResolvedValueOnce(item('New library'));
  const view = hook();
  view.rerender({ target: 'other' });
  act(() => useWorkspaceStore.setState({ libraryScope: 'library-b' }));
  await waitFor(() => expect(view.result.current.value).toEqual(item('New library')));
  await act(async () => { target.resolve(item('Old target')); library.resolve(item('Old library')); });
  expect(view.result.current.value).toEqual(item('New library'));
  act(() => runtime.changed?.({ libraryScope: 'library-a' }));
  expect(view.result.current.value).toEqual(item('New library'));
  expect(runtime.load).toHaveBeenCalledTimes(3);
  view.unmount();
  expect(runtime.unlisten).toHaveBeenCalledTimes(6);
});
