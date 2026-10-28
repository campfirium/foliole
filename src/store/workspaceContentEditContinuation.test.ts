import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { acknowledgeCreatedContentVersion, captureContentEdit } from './workspaceContentEditAcknowledgements';
import { markNodeCreatePending, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import { syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import {
  completeNodeCreateRuntimePersist, deferNodeContentRuntimePersist,
  drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests
} from './workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(),
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null)
}));

function createHarness(versionId: string | null = 'ver_base') {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = { ...fixture.nodesById['node-1']!, content: 'Original', currentVersionId: versionId };
  return createWorkspaceNodeActionsSetStateHarness(fixture);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetNodeContentVersionGuardForTests();
});

afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  vi.useRealTimers();
});

it.each(['queued', 'buffered'] as const)('continues only already unfinished %s input from its accepted local submission', async (mode) => {
  const harness = createHarness();
  const update = createUpdateNodeContentAction(harness.setState);
  const runtime = vi.mocked(syncNodeContentWithAnchorsMutationToRuntime);
  let finish!: (value: Awaited<ReturnType<typeof syncNodeContentWithAnchorsMutationToRuntime>>) => void;
  runtime.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(null);
  await update('node-1', 'First input', { baseVersionId: 'ver_base', publishLocal: false });
  const first = drainPendingNodeContentRuntimePersists();
  if (mode === 'buffered') deferNodeContentRuntimePersist('node-1');
  else await update('node-1', 'Continued input', { baseVersionId: 'ver_base', publishLocal: false });
  const submittedNode = { ...harness.getState().nodesById['node-1']!, content: 'First input' };
  finish({
    nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(submittedNode, 0), content: 'External merge' }],
    contentEdit: { submittedVersionId: 'ver_local', currentVersionId: 'ver_merge' }
  });
  await expect(first).resolves.toBe(true);
  if (mode === 'buffered') await update('node-1', 'Continued input', { baseVersionId: 'ver_base', publishLocal: false });
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  expect(runtime.mock.calls[1]![0]).toMatchObject({ content: 'Continued input', contentEdit: { baseVersionId: 'ver_local' } });
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  expect(runtime.mock.calls[2]![0]).toEqual(runtime.mock.calls[1]![0]);
});

it('delivers creation versions only to input already waiting for creation', async () => {
  const harness = createHarness(null);
  const runtime = vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue(null);
  markNodeCreatePending('node-1');
  await createUpdateNodeContentAction(harness.setState)('node-1', 'Typed during creation', { publishLocal: false });
  acknowledgeCreatedContentVersion('node-1', 'ver_created');
  await expect(completeNodeCreateRuntimePersist('node-1')).resolves.toBe(false);
  expect(runtime.mock.calls[0]![0]).toMatchObject({ contentEdit: { baseVersionId: 'ver_created' } });
  expect(captureContentEdit({ ...harness.getState().nodesById['node-1']!, currentVersionId: null })).toBeUndefined();
});

it('hands buffered input the last explicitly drained predecessor without accumulating ancestry', async () => {
  const harness = createHarness();
  const update = createUpdateNodeContentAction(harness.setState);
  const runtime = vi.mocked(syncNodeContentWithAnchorsMutationToRuntime);
  let finish!: (value: Awaited<ReturnType<typeof syncNodeContentWithAnchorsMutationToRuntime>>) => void;
  const node = harness.getState().nodesById['node-1']!;
  const receipt = (versionId: string) => ({ nodes: [createWorkspaceRuntimeNodeSnapshot(node, 0)],
    contentEdit: { currentVersionId: versionId, submittedVersionId: versionId } });
  runtime.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(receipt('ver_second')).mockResolvedValue(null);
  await update('node-1', 'First', { baseVersionId: 'ver_base', publishLocal: false });
  const first = drainPendingNodeContentRuntimePersists();
  await update('node-1', 'Second', { baseVersionId: 'ver_base', publishLocal: false });
  deferNodeContentRuntimePersist('node-1');
  finish(receipt('ver_first'));
  await first;
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  await update('node-1', 'Third', { baseVersionId: 'ver_base', publishLocal: false });
  await drainPendingNodeContentRuntimePersists();
  expect(runtime.mock.calls[2]![0]).toMatchObject({ contentEdit: { baseVersionId: 'ver_second' } });
});
