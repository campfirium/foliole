import { afterEach, expect, it, vi } from 'vitest';

import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { installWorkspaceHistoryPersistence, resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository, resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createDeleteNodesAction } from './workspaceStoreStructureDeleteAction';

vi.mock('../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));

const region = { id: 'region', x: 0, y: 0, width: 0.5, height: 0.5 };
const imageRegions = [{ attachmentId: 'image', regions: [region] }];

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  const parent = fixture.nodesById['node-1']!;
  fixture.nodesById = {
    ...fixture.nodesById,
    [parent.id]: { ...parent, imageRegions },
    child: {
      ...parent, id: 'child', kind: 'item', parentNodeId: parent.id, imageRegions,
      anchorLink: { id: 'region', kind: 'cloze', locator: { attachmentId: 'image', ...region } }
    }
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const repository = createBrowserLocalWorkspaceMutationRepository();
  repository.syncSoftDeleteNodes = vi.fn(repository.syncSoftDeleteNodes);
  repository.syncRestoreNodes = vi.fn(repository.syncRestoreNodes);
  installWorkspaceMutationRepository(repository);
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState(history);
  const deleteNodes = createDeleteNodesAction(harness.setState, repository, harness.getState);
  return { ...harness, repository, history, deleteNodes };
}

afterEach(() => {
  resetWorkspaceMutationRepository();
  resetWorkspaceHistoryPersistence();
  vi.clearAllMocks();
});

it('commits parent regions with deletion and supports immediate Undo and Redo', async () => {
  const h = createHarness();
  const forbiddenSecondWrite = vi.fn(async () => { throw new Error('separate parent save'); });
  installWorkspaceHistoryPersistence({
    persistNodeSnapshots: forbiddenSecondWrite, persistReadingSnapshots: forbiddenSecondWrite,
    persistReviewSnapshot: forbiddenSecondWrite, persistShelveSnapshots: forbiddenSecondWrite
  });
  await h.deleteNodes(['child']);
  expect(h.getState().trashedNodeIds).toContain('child');
  expect(h.getState().nodesById['node-1']?.imageRegions).toBeNull();
  expect(h.repository.syncSoftDeleteNodes).toHaveBeenCalledWith(expect.objectContaining({
    parentUpdates: [{ nodeId: 'node-1', imageRegions: null, updatedAt: expect.any(String) }]
  }));
  expect(h.history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(h.getState().trashedNodeIds).not.toContain('child'));
  expect(h.getState().nodesById['node-1']?.imageRegions).toEqual(imageRegions);
  expect(h.repository.syncRestoreNodes).toHaveBeenCalledWith(expect.objectContaining({
    parentUpdates: [{ nodeId: 'node-1', imageRegions, updatedAt: expect.any(String) }]
  }));
  expect(h.history.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(h.getState().trashedNodeIds).toContain('child'));
  expect(h.getState().nodesById['node-1']?.imageRegions).toBeNull();
  expect(forbiddenSecondWrite).not.toHaveBeenCalled();
});

it('keeps the current view and history unchanged and reports a rejected delete', async () => {
  const h = createHarness();
  vi.mocked(h.repository.syncSoftDeleteNodes).mockRejectedValue(new Error('parent write failed'));
  const before = h.getState();
  await h.deleteNodes(['child']);
  expect(h.getState().trashedNodeIds).toEqual(before.trashedNodeIds);
  expect(h.getState().nodesById).toEqual(before.nodesById);
  expect(h.getState().appActionHistory.undoStack).toEqual([]);
  expect(h.getState().appActionHistory.pendingAction).toBeNull();
  expect(showAppRuntimeNotice).toHaveBeenCalledWith(expect.any(String), 'error');
});

it('retains a failed Undo for retry without restoring the child or parent in the view', async () => {
  const h = createHarness();
  await h.deleteNodes(['child']);
  vi.mocked(h.repository.syncRestoreNodes).mockRejectedValueOnce(new Error('parent write failed'));
  const entry = h.getState().appActionHistory.undoStack[0];
  expect(h.history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(h.getState().appActionHistory.applying).toBeNull());
  expect(h.getState().trashedNodeIds).toContain('child');
  expect(h.getState().nodesById['node-1']?.imageRegions).toBeNull();
  expect(h.getState().appActionHistory.undoStack).toEqual([entry]);
  expect(h.history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(h.getState().trashedNodeIds).not.toContain('child'));
});
