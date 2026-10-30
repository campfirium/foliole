import { afterEach, expect, it, vi } from 'vitest';

import { getWorkspaceListNodeOpening } from '../features/nodes/model/workspaceListNode';

import { toRendererBoundaryNode } from './workspaceRendererBoundary';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import { resetPendingNodeContentRuntimePersistsForTests } from './workspaceStoreContentRuntimePersist';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(),
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null)
}));

afterEach(() => resetPendingNodeContentRuntimePersistsForTests());

it('updates body status when typing into a topic loaded as empty', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const node = fixture.nodesById['node-1']!;
  fixture.nodesById['node-1'] = {
    ...node, bodyStatus: 'empty', content: '', hasContent: false
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);

  await createUpdateNodeContentAction(harness.setState)('node-1', 'Alpha Beta Gamma');

  expect(harness.getState().nodesById['node-1']).toMatchObject({
    bodyStatus: 'ready', content: 'Alpha Beta Gamma', hasContent: true
  });
});

it('keeps the current opening after leaving a newly edited topic and clears it when its body is emptied', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = { ...fixture.nodesById['node-1']!, title: 'A quick note.',
    content: '', bodyStatus: 'empty', hasContent: false, openingText: null };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const update = createUpdateNodeContentAction(harness.setState);
  await update('node-1', 'A quick note.');
  expect(getWorkspaceListNodeOpening(toRendererBoundaryNode(harness.getState().nodesById['node-1']!, false)))
    .toBe('A quick note.');
  await update('node-1', 'Revised body.');
  expect(getWorkspaceListNodeOpening(toRendererBoundaryNode(harness.getState().nodesById['node-1']!, false)))
    .toBe('Revised body.');
  await update('node-1', '');
  expect(harness.getState().nodesById['node-1']?.openingText).toBeNull();
});
