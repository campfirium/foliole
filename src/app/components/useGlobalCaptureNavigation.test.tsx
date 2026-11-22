import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const onGlobalCaptureNavigate = vi.hoisted(() => vi.fn());
const openWorkspaceNodeWithPreparedDocument = vi.hoisted(() => vi.fn());
const refreshWorkspaceState = vi.hoisted(() => vi.fn());
const refreshWorkspaceStateWithScope = vi.hoisted(() => vi.fn());
const workspaceStoreState = vi.hoisted(() => ({
  activeNodeId: 'node-old',
  libraryScope: 'library-a' as string | null,
  openNode: vi.fn()
}));

vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onGlobalCaptureNavigate
}));

vi.mock('../../store/workspaceRefreshScheduler', () => ({
  refreshWorkspaceState,
  refreshWorkspaceStateWithScope
}));

vi.mock('../../store/workspaceNodePreparation', () => ({
  openWorkspaceNodeWithPreparedDocument
}));

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => workspaceStoreState
  }
}));

import { useGlobalCaptureNavigation } from './useGlobalCaptureNavigation';

function triggerNavigate(handler: ((payload: { nodeId: string }) => void) | null, nodeId: string) {
  if (!handler) {
    throw new Error('global capture navigate handler was not registered');
  }
  handler({ nodeId });
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceStoreState.activeNodeId = 'node-old';
  workspaceStoreState.libraryScope = 'library-a';
  openWorkspaceNodeWithPreparedDocument.mockResolvedValue(null);
  refreshWorkspaceState.mockResolvedValue(undefined);
  refreshWorkspaceStateWithScope.mockResolvedValue(undefined);
});

it('refreshes the workspace before opening a clicked global clip toast target', async () => {
  let navigateHandler: ((payload: { nodeId: string }) => void) | null = null;
  const refresh = createDeferred();
  const unlisten = vi.fn();
  const onSelectNode = vi.fn();
  onGlobalCaptureNavigate.mockImplementation(async (handler: (payload: { nodeId: string }) => void) => {
    navigateHandler = handler;
    return unlisten;
  });
  refreshWorkspaceStateWithScope.mockReturnValue(refresh.promise);

  const view = renderHook(() => useGlobalCaptureNavigation(onSelectNode));
  await waitFor(() => expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1));
  triggerNavigate(navigateHandler, 'node-clipped');

  // WA-062: the capture used to rehydrate the whole library; it now reads the new Node and the list it joined.
  expect(refreshWorkspaceStateWithScope).toHaveBeenCalledWith({ kind: 'nodes', nodeIds: ['node-clipped'], structure: true },
    'library-a', 'global-capture-navigation');
  expect(refreshWorkspaceState).not.toHaveBeenCalled();
  expect(onSelectNode).not.toHaveBeenCalled();

  refresh.resolve();
  await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('node-clipped'));
  expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith('node-clipped', {
    forceLoad: true,
    keepWarm: true
  });
  expect(workspaceStoreState.openNode).toHaveBeenCalledWith('node-clipped');
  view.unmount();
  expect(unlisten).toHaveBeenCalledTimes(1);
});

it('falls back to a whole refresh before the workspace knows its library', async () => {
  let navigateHandler: ((payload: { nodeId: string }) => void) | null = null;
  workspaceStoreState.libraryScope = null;
  onGlobalCaptureNavigate.mockImplementation(async (handler: (payload: { nodeId: string }) => void) => {
    navigateHandler = handler;
    return vi.fn();
  });
  const onSelectNode = vi.fn();
  const view = renderHook(() => useGlobalCaptureNavigation(onSelectNode));
  await waitFor(() => expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1));
  triggerNavigate(navigateHandler, 'node-clipped');
  await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('node-clipped'));
  expect(refreshWorkspaceState).toHaveBeenCalledWith('global-capture-navigation');
  expect(refreshWorkspaceStateWithScope).not.toHaveBeenCalled();
  view.unmount();
});

it('does not reopen the target when the normal selection path already changed active node', async () => {
  let navigateHandler: ((payload: { nodeId: string }) => void) | null = null;
  const unlisten = vi.fn();
  const onSelectNode = vi.fn(async () => {
    workspaceStoreState.activeNodeId = 'node-clipped';
  });
  onGlobalCaptureNavigate.mockImplementation(async (handler: (payload: { nodeId: string }) => void) => {
    navigateHandler = handler;
    return unlisten;
  });

  const view = renderHook(() => useGlobalCaptureNavigation(onSelectNode));
  await waitFor(() => expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1));
  triggerNavigate(navigateHandler, 'node-clipped');

  await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('node-clipped'));
  expect(openWorkspaceNodeWithPreparedDocument).not.toHaveBeenCalled();
  expect(workspaceStoreState.openNode).not.toHaveBeenCalled();
  view.unmount();
});

it('does not reopen the target when prepared navigation handled it', async () => {
  let navigateHandler: ((payload: { nodeId: string }) => void) | null = null;
  const unlisten = vi.fn();
  const onSelectNode = vi.fn();
  onGlobalCaptureNavigate.mockImplementation(async (handler: (payload: { nodeId: string }) => void) => {
    navigateHandler = handler;
    return unlisten;
  });
  refreshWorkspaceState.mockResolvedValue(undefined);
  openWorkspaceNodeWithPreparedDocument.mockImplementation(async () => {
    workspaceStoreState.activeNodeId = 'node-clipped';
    return { focusAnchor: null, nodeId: 'node-clipped' };
  });

  const view = renderHook(() => useGlobalCaptureNavigation(onSelectNode));
  await waitFor(() => expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1));
  triggerNavigate(navigateHandler, 'node-clipped');

  await waitFor(() => expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith('node-clipped', {
    forceLoad: true,
    keepWarm: true
  }));
  expect(workspaceStoreState.openNode).not.toHaveBeenCalled();
  view.unmount();
});

it('keeps one bridge subscription while using the latest selection handler', async () => {
  let navigateHandler: ((payload: { nodeId: string }) => void) | null = null;
  const unlisten = vi.fn();
  const firstSelectNode = vi.fn();
  const latestSelectNode = vi.fn();
  onGlobalCaptureNavigate.mockImplementation(async (handler: (payload: { nodeId: string }) => void) => {
    navigateHandler = handler;
    return unlisten;
  });

  const view = renderHook(({ onSelectNode }) => useGlobalCaptureNavigation(onSelectNode), {
    initialProps: { onSelectNode: firstSelectNode }
  });
  await waitFor(() => expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1));
  view.rerender({ onSelectNode: latestSelectNode });
  triggerNavigate(navigateHandler, 'node-clipped');

  await waitFor(() => expect(latestSelectNode).toHaveBeenCalledWith('node-clipped'));
  expect(firstSelectNode).not.toHaveBeenCalled();
  expect(onGlobalCaptureNavigate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(unlisten).toHaveBeenCalledTimes(1);
});
