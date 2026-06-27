import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  syncCreateNodeMutationToRuntime,
  syncNodeContentWithAnchorsMutationToRuntime,
  syncNodeOrderToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function createParentEditedFixture(content: string) {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content
  };
  return fixture;
}

function createHighlightChildNode(nodeId: string) {
  return {
    id: nodeId,
    parentNodeId: 'node-1',
    kind: 'topic' as const,
    title: 'Beta',
    hasContent: true,
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight' as const,
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function createClozeChildNode() {
  return {
    id: 'node-cloze',
    parentNodeId: 'node-1',
    kind: 'item' as const,
    title: 'Alpha [...] Gamma',
    hasContent: true,
    content: 'Alpha [...] Gamma',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze' as const,
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    hasReveal: true,
    reveal: 'Beta',
    review: {
      difficulty: 5,
      due: '2026-04-14T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0 as const
    },
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function expectUpdatedBetaLocator() {
  return {
    from: 6,
    originalText: 'Better',
    to: 12
  };
}

function expectShiftedBetaLocator() {
  return {
    from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
    originalText: 'Beta',
    to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
  };
}

function createHarnessWithActions(content: string) {
  const fixture = createParentEditedFixture(content);
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);
  return { actions, fixture, harness };
}

async function runCreateHighlightLocatorCase() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const nodeId = await actions.createHighlightNodeFromSelection('node-1', 'Highlighted', 'hl-1', {
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 10,
      originalText: 'Highlighted',
      to: 21
    }
  });

  expect(nodeId).not.toBeNull();
  expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
  expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: nodeId,
      parentNodeId: 'node-1',
      content: 'Highlighted',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 10,
          originalText: 'Highlighted',
          to: 21
        }
      }
    }),
    expect.any(Array),
    'node-1',
    expect.any(Number)
  );
}

async function runParentShiftLocatorCase() {
  vi.useFakeTimers();
  const { actions, fixture, harness } = createHarnessWithActions('Alpha Beta Gamma');
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-2'];
  fixture.nodesById['node-2']! = createHighlightChildNode('node-2');

  await actions.updateNodeContent('node-1', 'Start Alpha Beta Gamma');
  await vi.advanceTimersByTimeAsync(800);

  expect(harness.getState().nodesById['node-2']!).toEqual(
    expect.objectContaining({
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: expectShiftedBetaLocator()
      }
    })
  );
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'node-1', content: 'Start Alpha Beta Gamma' }),
    [expect.objectContaining({
      id: 'node-2',
      anchorLink: { id: 'hl-1', kind: 'highlight', locator: expectShiftedBetaLocator() }
    })],
    expect.any(Array)
  );
}

async function runRefreshedChildPayloadsCase() {
  vi.useFakeTimers();
  const { actions, fixture } = createHarnessWithActions('Alpha Beta Gamma');
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-highlight', 'node-cloze'];
  fixture.nodesById['node-highlight'] = createHighlightChildNode('node-highlight');
  fixture.nodesById['node-cloze'] = createClozeChildNode();

  await actions.updateNodeContent('node-1', 'Alpha Better Gamma');
  await vi.advanceTimersByTimeAsync(800);

  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'node-1', content: 'Alpha Better Gamma' }),
    [
      expect.objectContaining({
        id: 'node-highlight',
        content: 'Beta',
        title: 'Beta',
        anchorLink: { id: 'hl-1', kind: 'highlight', locator: expectUpdatedBetaLocator() }
      }),
      expect.objectContaining({
        id: 'node-cloze',
        content: 'Alpha [...] Gamma',
        reveal: 'Beta',
        title: 'Alpha [...] Gamma',
        anchorLink: { id: 'cloze-1', kind: 'cloze', locator: expectUpdatedBetaLocator() }
      })
    ],
    expect.any(Array)
  );
}

async function runDeletedAnchorTextNoSyncCase() {
  vi.useFakeTimers();
  const { actions, fixture } = createHarnessWithActions('Alpha Beta Gamma');
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-highlight'];
  fixture.nodesById['node-highlight']! = createHighlightChildNode('node-highlight');

  await actions.updateNodeContent('node-1', 'Alpha  Gamma');
  await vi.advanceTimersByTimeAsync(800);

  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'node-1', content: 'Alpha  Gamma' }),
    [expect.objectContaining({
      id: 'node-highlight',
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    })],
    expect.any(Array)
  );
}

it('syncs text locator when creating highlight nodes from selections', runCreateHighlightLocatorCase);
it('remaps direct child text locators when parent content shifts', runParentShiftLocatorCase);
it('syncs refreshed child highlight and cloze payloads when parent text changes inside anchored ranges', runRefreshedChildPayloadsCase);
it('keeps syncing a child highlight as an unresolved zero-width anchor when the anchored text is deleted entirely', runDeletedAnchorTextNoSyncCase);
