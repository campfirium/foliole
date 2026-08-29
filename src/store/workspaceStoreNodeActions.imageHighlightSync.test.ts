import { afterEach, expect, it, vi } from 'vitest';

import { syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

afterEach(() => {
  vi.useRealTimers();
});

it('keeps imported image highlights as image regions when parent image markdown is localized', async () => {
  vi.useFakeTimers();
  const remoteImage = '![](https://tvax2.sinaimg.cn/large/66fd066bgy1hwdjok6tdfj20zk0qoqoq.jpg)';
  const localImage = '![](asset://7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec.jpg)';
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: `Lead\n\n${remoteImage}`
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-image-highlight'];
  fixture.nodesById['node-image-highlight'] = {
    id: 'node-image-highlight',
    parentNodeId: 'node-1',
    kind: 'topic',
    title: remoteImage,
    hasContent: true,
    content: remoteImage,
    anchorLink: {
      id: 'imported-highlight-image',
      kind: 'highlight',
      locator: { from: 6, originalText: remoteImage, to: 6 + remoteImage.length }
    },
    imageRegions: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);

  await actions.updateNodeContent('node-1', `Lead\n\n${localImage}`);
  await vi.advanceTimersByTimeAsync(800);

  expect(harness.getState().nodesById['node-image-highlight']).toEqual(
    expect.objectContaining({
      anchorLink: expect.objectContaining({
        locator: { from: 6, originalText: localImage, to: 6 + localImage.length }
      }),
      imageRegions: [{
        attachmentId: '7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec',
        regions: [{ height: 1, id: 'imported-highlight-image-image-0', width: 1, x: 0, y: 0 }]
      }]
    })
  );
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'node-1', content: `Lead\n\n${localImage}` }),
    [expect.objectContaining({
      id: 'node-image-highlight',
      imageRegions: [expect.objectContaining({
        attachmentId: '7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec'
      })]
    })],
    expect.any(Array)
  );
});
