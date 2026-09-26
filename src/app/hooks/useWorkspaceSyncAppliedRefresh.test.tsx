import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const onWorkspaceContentChanged = vi.hoisted(() => vi.fn());
const onWorkspaceSyncApplied = vi.hoisted(() => vi.fn());

vi.mock('../../shared/platform/runtimeShellEvents', async () => ({
  ...await vi.importActual<typeof import('../../shared/platform/runtimeShellEvents')>('../../shared/platform/runtimeShellEvents'),
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
}));

import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  syncAppliedChangesWorkspace,
  useWorkspaceContentChangedRefresh,
  useWorkspaceSyncAppliedRefresh
} from './useWorkspaceSyncAppliedRefresh';

type WorkspaceSyncAppliedPayload = Parameters<typeof syncAppliedChangesWorkspace>[0];

const nodeApplied: WorkspaceSyncAppliedPayload = {
  appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: []
};

it.each([
  ['setting', false], ['watched_folder', false], ['node_open_state', false],
  ['node_reading', true], ['unknown_type', true]
])('classifies %s sync changes for workspace refresh', (objectType, expected) => {
  expect(syncAppliedChangesWorkspace({
    appliedNodeIds: [], appliedObjectIds: [`${objectType}:item:with:colons`], appliedReviewOpIds: []
  })).toBe(expected);
});

it('refreshes Android view state candidates but not remote desktop view state', () => {
  const payload = (identity: string): WorkspaceSyncAppliedPayload => ({
    appliedNodeIds: [], appliedObjectIds: [identity], appliedReviewOpIds: []
  });
  expect(syncAppliedChangesWorkspace(payload('view_state:session_resume:windows:desktop:Maci:active_node'))).toBe(false);
  expect(syncAppliedChangesWorkspace(payload('view_state:session_resume:android:phone:Android:active_node'))).toBe(true);
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  onWorkspaceContentChanged.mockReset();
  onWorkspaceSyncApplied.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('rehydrates the desktop workspace when sync changes are applied by the runtime', async () => {
  let handler: ((payload: WorkspaceSyncAppliedPayload) => void) | null = null;
  const unlisten = vi.fn();
  onWorkspaceSyncApplied.mockImplementation(async (nextHandler: (payload: WorkspaceSyncAppliedPayload) => void) => {
    handler = nextHandler;
    return unlisten;
  });
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  const view = renderHook(() => useWorkspaceSyncAppliedRefresh());
  await waitFor(() => expect(onWorkspaceSyncApplied).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  await act(async () => {
    handler?.(nodeApplied);
  });
  expect(rehydrate).not.toHaveBeenCalled();
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });

  expect(rehydrate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(unlisten).toHaveBeenCalledTimes(1);
});

it('does not reload the workspace for a settings-only sync event', async () => {
  let handler: ((payload: WorkspaceSyncAppliedPayload) => void) | null = null;
  onWorkspaceSyncApplied.mockImplementation(async (nextHandler: (payload: WorkspaceSyncAppliedPayload) => void) => {
    handler = nextHandler;
    return vi.fn();
  });
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  const view = renderHook(() => useWorkspaceSyncAppliedRefresh());
  await waitFor(() => expect(onWorkspaceSyncApplied).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  act(() => handler?.({
    appliedNodeIds: [], appliedObjectIds: ['setting:user_space:windows:desktop:app_settings'], appliedReviewOpIds: []
  }));
  await act(async () => vi.advanceTimersByTime(1200));
  expect(rehydrate).not.toHaveBeenCalled();
  view.unmount();
});

it('rehydrates the desktop workspace when runtime content changes', async () => {
  let handler: (() => void) | null = null;
  const unlisten = vi.fn();
  onWorkspaceContentChanged.mockImplementation(async (nextHandler: () => void) => {
    handler = nextHandler;
    return unlisten;
  });
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await waitFor(() => expect(onWorkspaceContentChanged).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  await act(async () => {
    handler?.();
  });
  expect(rehydrate).not.toHaveBeenCalled();
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });

  expect(rehydrate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(unlisten).toHaveBeenCalledTimes(1);
});

it('queues sync and content refreshes through one rehydrate scheduler', async () => {
  let syncHandler: ((payload: WorkspaceSyncAppliedPayload) => void) | null = null;
  let contentHandler: (() => void) | null = null;
  let resolveFirstRehydrate: (() => void) | null = null;
  onWorkspaceSyncApplied.mockImplementation(async (nextHandler: (payload: WorkspaceSyncAppliedPayload) => void) => {
    syncHandler = nextHandler;
    return vi.fn();
  });
  onWorkspaceContentChanged.mockImplementation(async (nextHandler: () => void) => {
    contentHandler = nextHandler;
    return vi.fn();
  });
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate')
    .mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstRehydrate = resolve;
    }))
    .mockResolvedValue(undefined);

  renderHook(() => {
    useWorkspaceSyncAppliedRefresh();
    useWorkspaceContentChangedRefresh();
  });
  await waitFor(() => expect(onWorkspaceSyncApplied).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onWorkspaceContentChanged).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  act(() => {
    syncHandler?.(nodeApplied);
    contentHandler?.();
    contentHandler?.();
    syncHandler?.(nodeApplied);
  });
  act(() => {
    vi.advanceTimersByTime(1199);
  });
  expect(rehydrate).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(rehydrate).toHaveBeenCalledTimes(1);
  act(() => {
    contentHandler?.();
    contentHandler?.();
    resolveFirstRehydrate?.();
  });
  await flushPromises();

  act(() => {
    vi.advanceTimersByTime(1200);
  });
  expect(rehydrate).toHaveBeenCalledTimes(2);
});
