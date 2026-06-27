import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flushDirtyWorkspaceNodeSyncVersions } from '../../shared/platform/workspaceRuntimeRepository';
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

describe('useAppRuntime close flush persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('persists pending node content before the close flush resolves', async () => {
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
  });
});
