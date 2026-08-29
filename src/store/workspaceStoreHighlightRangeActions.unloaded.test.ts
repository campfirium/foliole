import { beforeEach, expect, it, vi } from 'vitest';

import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';

import { resetWorkspaceNodeDocumentCacheForTest } from './workspaceNodeDocumentCache';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
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
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

vi.mock('../shared/platform/workspaceRuntimeDocumentRepository', () => ({
  loadWorkspaceNodeDocumentFromRuntime: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentCacheForTest();
});

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: 'Alpha Beta Gamma'
  };
  fixture.nodesById['highlight-1'] = {
    id: 'highlight-1',
    parentNodeId: 'node-1',
    kind: 'topic',
    title: 'Beta',
    hasContent: true,
    bodyStatus: 'missing',
    content: '',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'highlight-1'];
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  return {
    actions: createWorkspaceNodeActions(harness.setState),
    harness
  };
}

it('loads unloaded highlight child content before syncing the adjusted range', async () => {
  vi.mocked(loadWorkspaceNodeDocumentFromRuntime).mockResolvedValue({
    content: '> Beta\n※ Existing note',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null
  });
  const { actions, harness } = createHarness();

  const updated = actions.updateHighlightAnchorRange?.('highlight-1', { from: 6, to: 16 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(updated).toBe(true);
  expect(loadWorkspaceNodeDocumentFromRuntime).toHaveBeenCalledWith('highlight-1');
  expect(harness.getState().nodesById['highlight-1']).toEqual(expect.objectContaining({
    content: '> Beta Gamma\n※ Existing note',
    title: 'Beta Gamma',
    anchorLink: expect.objectContaining({
      locator: { from: 6, originalText: 'Beta Gamma', to: 16 }
    })
  }));
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({
    content: '> Beta Gamma\n※ Existing note',
    title: 'Beta Gamma'
  }));
});

it('recovers unloaded stale child content when the stored locator already moved ahead', async () => {
  vi.mocked(loadWorkspaceNodeDocumentFromRuntime).mockResolvedValue({
    content: 'Beta',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null
  });
  const { actions, harness } = createHarness();
  harness.getState().nodesById['node-1'] = {
    ...harness.getState().nodesById['node-1']!,
    content: 'Alpha Beta Gamma Delta'
  };
  harness.getState().nodesById['highlight-1'] = {
    ...harness.getState().nodesById['highlight-1']!,
    title: 'Beta Gamma',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta Gamma', to: 16 }
    }
  };

  const updated = actions.updateHighlightAnchorRange?.('highlight-1', { from: 6, to: 22 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['highlight-1']).toEqual(expect.objectContaining({
    content: 'Beta Gamma Delta',
    title: 'Beta Gamma Delta',
    anchorLink: expect.objectContaining({
      locator: { from: 6, originalText: 'Beta Gamma Delta', to: 22 }
    })
  }));
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Beta Gamma Delta',
    title: 'Beta Gamma Delta'
  }));
});

it('loads unloaded cloze child content before syncing the adjusted range', async () => {
  vi.mocked(loadWorkspaceNodeDocumentFromRuntime).mockResolvedValue({
    content: 'Alpha [...] Gamma',
    hideTitleHeading: false,
    kind: 'item',
    reveal: 'Beta'
  });
  const { actions, harness } = createHarness();
  harness.getState().nodesById['cloze-1'] = {
    ...harness.getState().nodesById['highlight-1']!,
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    bodyStatus: 'missing',
    content: '',
    id: 'cloze-1',
    kind: 'item',
    reveal: 'Beta',
    title: 'Alpha [...] Gamma'
  };

  const updated = actions.updateHighlightAnchorRange?.('cloze-1', { from: 6, to: 16 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(updated).toBe(true);
  expect(loadWorkspaceNodeDocumentFromRuntime).toHaveBeenCalledWith('cloze-1');
  expect(harness.getState().nodesById['cloze-1']).toEqual(expect.objectContaining({
    content: 'Alpha [...]',
    reveal: 'Beta Gamma',
    title: 'Alpha [...]',
    anchorLink: expect.objectContaining({
      locator: { from: 6, originalText: 'Beta Gamma', to: 16 }
    })
  }));
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Alpha [...]',
    reveal: 'Beta Gamma',
    title: 'Alpha [...]'
  }));
});
