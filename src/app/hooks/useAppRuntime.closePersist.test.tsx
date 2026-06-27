import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flushDirtyWorkspaceNodeSyncVersions } from '../../shared/platform/workspaceRuntimeRepository';
import {
  markNodeCreateConfirmed,
  markNodeCreatePending,
  resetNodeContentVersionGuardForTests
} from '../../store/workspaceNodeContentVersionGuard';
import { syncNodeContentWithAnchorsMutationToRuntime } from '../../store/workspaceRuntimeSync';
import { createWorkspaceNodeActions } from '../../store/workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from '../../store/workspaceStoreNodeActions.test-support';

import { useAppRuntime } from './useAppRuntime';

vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({
  flushDirtyWorkspaceNodeSyncVersions: vi.fn(async () => [])
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => ({})),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

async function runPendingContentCloseFlushCase() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);
  const { result } = renderHook(() => useAppRuntime(320, 360));
  let closeResult = false;

  await act(async () => {
    result.current.registerPendingEditorDraftFlush(null, async () => {
      await actions.updateNodeContent('node-1', 'Draft before close');
      return true;
    });
    closeResult = await result.current.flushPendingEditorDraftImmediately();
  });

  expect(closeResult).toBe(true);
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Draft before close',
      id: 'node-1'
    }),
    [],
    expect.any(Array)
  );
  expect(flushDirtyWorkspaceNodeSyncVersions).toHaveBeenCalledTimes(1);
}

async function runCreatePendingCloseFlushCase() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);
  const { result } = renderHook(() => useAppRuntime(320, 360));
  let closeResult = false;

  await act(async () => {
    markNodeCreatePending('node-1');
    result.current.registerPendingEditorDraftFlush(null, async () => {
      await actions.updateNodeContent('node-1', 'Draft while create is pending');
      return true;
    });
    const closePromise = result.current.flushPendingEditorDraftImmediately().then((value) => {
      closeResult = value;
    });

    await Promise.resolve();
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();

    markNodeCreateConfirmed('node-1');
    await closePromise;
  });

  expect(closeResult).toBe(true);
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Draft while create is pending',
      id: 'node-1'
    }),
    [],
    expect.any(Array)
  );
}

async function runFreshEditorContentCloseFlushCase() {
  const { result } = renderHook(() => useAppRuntime(320, 360));
  const freshFlush = vi.fn(() => true);
  const closeFlush = vi.fn(async () => true);

  await act(async () => {
    result.current.editorRef.current = {
      getContent: () => 'Fresh close body'
    } as never;
    result.current.registerPendingEditorDraftFlush(null, closeFlush, freshFlush);
    await result.current.flushPendingEditorDraftImmediately();
  });

  expect(freshFlush).toHaveBeenCalledWith(null, 'Fresh close body');
  expect(closeFlush).toHaveBeenCalledTimes(1);
}

function runFreshEditorContentFallbackFlushCase() {
  const { result } = renderHook(() => useAppRuntime(320, 360));
  const freshFlush = vi.fn(() => false);
  const pendingFlush = vi.fn(() => true);
  let flushResult = false;

  act(() => {
    result.current.editorRef.current = {
      getContent: () => 'Programmatic close body'
    } as never;
    result.current.registerPendingEditorDraftFlush(pendingFlush, null, freshFlush);
    flushResult = result.current.flushPendingEditorDraft();
  });

  expect(flushResult).toBe(true);
  expect(freshFlush).toHaveBeenCalledWith(null, 'Programmatic close body');
  expect(pendingFlush).toHaveBeenCalledTimes(1);
}

describe('useAppRuntime close flush persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNodeContentVersionGuardForTests();
    vi.useFakeTimers();
  });

  it('persists pending node content before the close flush resolves', runPendingContentCloseFlushCase);

  it('waits for create-pending content before the close flush resolves', runCreatePendingCloseFlushCase);

  it('captures fresh editor content before running close fallback flush', runFreshEditorContentCloseFlushCase);

  it('falls back to pending draft flush when fresh editor content is not accepted', runFreshEditorContentFallbackFlushCase);
});
