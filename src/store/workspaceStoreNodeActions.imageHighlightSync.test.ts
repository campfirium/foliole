import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createTestAttachmentResource,
  registerTestAttachmentResource,
  resetTestAttachmentResources
} from '../test/attachmentResourceTestSupport';

import { hasWorkspaceNodeMutationRuntime, syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
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

const IMAGE_ATTACHMENT_ID = 'image-attachment-1';
const IMAGE_CONTENT_HASH = '7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec';
const { assetUrl: IMAGE_ASSET_URL } = createTestAttachmentResource({
  attachmentId: IMAGE_ATTACHMENT_ID,
  contentHash: IMAGE_CONTENT_HASH,
  mimeType: 'image/jpeg'
});

beforeEach(() => {
  vi.clearAllMocks();
  registerTestAttachmentResource({
    attachmentId: IMAGE_ATTACHMENT_ID,
    contentHash: IMAGE_CONTENT_HASH,
    mimeType: 'image/jpeg'
  });
});

afterEach(() => {
  resetTestAttachmentResources();
  vi.useRealTimers();
});

it('keeps imported image highlights as image regions when parent image markdown is localized', async () => {
  vi.useFakeTimers();
  const remoteImage = '![](https://tvax2.sinaimg.cn/large/66fd066bgy1hwdjok6tdfj20zk0qoqoq.jpg)';
  const localImage = `![](${IMAGE_ASSET_URL})`;
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
        attachmentId: IMAGE_CONTENT_HASH,
        regions: [{ height: 1, id: 'imported-highlight-image-image-0', width: 1, x: 0, y: 0 }]
      }]
    })
  );
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'node-1', content: `Lead\n\n${localImage}` }),
    [expect.objectContaining({
      id: 'node-image-highlight',
      imageRegions: [expect.objectContaining({
        attachmentId: IMAGE_CONTENT_HASH
      })]
    })],
    expect.any(Array)
  );
});

it('keeps a mixed highlight on the later image when several image URLs are localized together', async () => {
  vi.useFakeTimers();
  const remoteFirst = '![First](https://example.com/first.jpg)';
  const remoteSecond = '![Second](https://example.com/second.jpg)';
  const localFirst = `![First](${IMAGE_ASSET_URL})`;
  const localSecond = `![Second](${IMAGE_ASSET_URL})`;
  const trailingText = 'Trailing highlighted paragraph.';
  const previousContent = `${remoteFirst}\n\nPreface\n\n${remoteSecond}\n${trailingText}`;
  const nextContent = `${localFirst}\n\nPreface\n\n${localSecond}\n${trailingText}`;
  const originalText = `${remoteSecond}\n${trailingText}`;
  const expectedText = `${localSecond}\n${trailingText}`;
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: previousContent
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-mixed-highlight'];
  fixture.nodesById['node-mixed-highlight'] = {
    id: 'node-mixed-highlight',
    parentNodeId: 'node-1',
    kind: 'topic',
    title: originalText,
    hasContent: true,
    content: originalText,
    anchorLink: {
      id: 'mixed-highlight',
      kind: 'highlight',
      locator: {
        from: previousContent.indexOf(remoteSecond),
        originalText,
        to: previousContent.length
      }
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

  await actions.updateNodeContent('node-1', nextContent);
  await vi.advanceTimersByTimeAsync(800);

  const expectedFrom = nextContent.indexOf(localSecond);
  expect(harness.getState().nodesById['node-mixed-highlight']?.anchorLink?.locator).toEqual({
    from: expectedFrom,
    originalText: expectedText,
    to: expectedFrom + expectedText.length
  });
});

it('applies persisted remaps returned for an anchor that hydrated after the local edit', async () => {
  vi.useFakeTimers();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  const previousContent = '![Remote](https://example.com/long-cover.png)\n\nTarget sentence.';
  const nextContent = '![Remote](asset://cover.png)\n\nTarget sentence.';
  const expectedFrom = nextContent.indexOf('Target sentence.');
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = { ...fixture.nodesById['node-1']!, content: previousContent };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue({
    anchorUpdates: [{
      anchorLink: {
        id: 'late-anchor', kind: 'highlight', locator: {
          from: expectedFrom, originalText: 'Target sentence.', to: nextContent.length
        }
      },
      imageRegions: null,
      nodeId: 'late-child',
      updatedAt: '2099-04-14T00:00:01.000Z'
    }],
    nodes: []
  });
  const actions = createWorkspaceNodeActions(harness.setState);

  await actions.updateNodeContent('node-1', nextContent);
  harness.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'late-child': {
        ...state.nodesById['node-1']!,
        anchorLink: {
          id: 'late-anchor', kind: 'highlight', locator: {
            from: previousContent.indexOf('Target sentence.'),
            originalText: 'Target sentence.',
            to: previousContent.length
          }
        },
        content: 'Target sentence.',
        id: 'late-child',
        parentNodeId: 'node-1',
        title: 'Target sentence.'
      }
    }
  }));
  await vi.advanceTimersByTimeAsync(800);

  expect(harness.getState().nodesById['late-child']?.anchorLink?.locator).toEqual({
    from: expectedFrom,
    originalText: 'Target sentence.',
    to: nextContent.length
  });
});
