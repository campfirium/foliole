import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { acknowledgeContentEdit, captureContentEdit } from './workspaceContentEditAcknowledgements';
import { markNodeContentEdited, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import { drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests } from './workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(),
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null)
}));

const original = 'Unique original editor basis';
const submitted = 'Unique submitted editor body';
const merged = 'Unique merged persisted body';

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!, content: original, currentVersionId: 'ver_base'
  };
  return createWorkspaceNodeActionsSetStateHarness(fixture);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue(null);
  resetNodeContentVersionGuardForTests();
});

afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
});

it('keeps an input basis in its unfinished save rather than the global node directory', async () => {
  const harness = createHarness();
  await createUpdateNodeContentAction(harness.setState)('node-1', submitted, {
    baseContent: original, baseVersionId: 'ver_base', publishLocal: false
  });
  const node = harness.getState().nodesById['node-1']!;
  expect(node.content).toBe(submitted);
  expect(Object.values(node)).not.toContain(original);
  expect(Object.values(trimWorkspaceNodesForRendererBoundary(null, { [node.id]: node })[node.id]!))
    .not.toContain(original);

  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  const request = vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mock.calls[0]![0];
  expect(request).toMatchObject({ contentEdit: { baseContent: original, baseVersionId: 'ver_base' } });
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  expect(vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mock.calls[1]![0]).toEqual(request);
});

it.each([false, true])('does not retain acknowledged body text in inactive directory nodes (newer input: %s)', (newerInput) => {
  const harness = createHarness();
  const node = { ...harness.getState().nodesById['node-1']!, content: submitted };
  const version = markNodeContentEdited(node.id);
  if (newerInput) markNodeContentEdited(node.id);
  harness.setState({ nodesById: { [node.id]: { ...node, content: newerInput ? 'Newer unsaved input' : submitted } } });
  acknowledgeContentEdit({
    edit: captureContentEdit(node), node, version, set: harness.setState,
    result: {
      nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node, 0), content: merged }],
      contentEdit: { currentVersionId: 'ver_merged', submittedVersionId: 'ver_submitted' }
    }
  });
  const current = harness.getState().nodesById[node.id]!;
  expect(current.content).toBe(newerInput ? 'Newer unsaved input' : merged);
  const inactive = trimWorkspaceNodesForRendererBoundary(null, { [node.id]: current })[node.id]!;
  expect(Object.values(inactive)).not.toContain(submitted);
  expect(Object.values(inactive)).not.toContain(merged);
});

it('does not reuse a finished save as the basis of an independent later edit', async () => {
  const harness = createHarness();
  const node = harness.getState().nodesById['node-1']!;
  acknowledgeContentEdit({
    edit: captureContentEdit(node), node, version: 0, set: harness.setState,
    result: {
      nodes: [createWorkspaceRuntimeNodeSnapshot(node, 0)],
      contentEdit: { currentVersionId: 'ver_finished', submittedVersionId: 'ver_finished' }
    }
  });
  await createUpdateNodeContentAction(harness.setState)('node-1', 'Independent editor input', {
    baseVersionId: 'ver_base', publishLocal: false
  });
  await drainPendingNodeContentRuntimePersists();
  expect(vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mock.calls[0]![0]).toMatchObject({
    contentEdit: { baseVersionId: 'ver_base' }
  });
});
