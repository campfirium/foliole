import { afterEach, expect, it, vi } from 'vitest';

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
