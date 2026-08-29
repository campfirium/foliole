import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentMutationToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(async () => undefined),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

vi.mock('./workspaceNodeDocumentCache', () => ({
  syncWorkspaceNodeDocumentCacheFromNode: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetNodeContentVersionGuardForTests();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
});

it('keeps current body when derived title runtime result carries stale content', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-03-06T00:00:01.000Z'));
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    vi.mocked(syncNodeContentMutationToRuntime).mockImplementationOnce(async (node) => ({
      nodeOrder: ['special-home', INBOX_NODE_ID, 'node-1'],
      nodes: [{
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        kind: node.kind,
        title: node.title,
        isTitleManual: node.isTitleManual ?? false,
        content: '# Seed',
        reveal: node.reveal,
        anchorLink: node.anchorLink ?? null,
        imageRegions: node.imageRegions ?? null,
        position: 2,
        createdAt: node.createdAt,
        updatedAt: '2026-03-06T00:00:02.000Z'
      }]
    }));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', 'Fresh body', { publishLocal: false });
    const applied = await actions.updateNodeDerivedTitle('node-1', '# Runtime Title\n\nOlder title source');

    expect(applied).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: 'Fresh body',
      title: 'Runtime Title'
    });
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it('keeps body edits made after derived title starts when local fallback applies', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
    let resolveTitleMutation!: () => void;
    vi.mocked(syncNodeContentMutationToRuntime).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveTitleMutation = () => resolve(null);
      })
    );
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const titlePromise = actions.updateNodeDerivedTitle('node-1', '# Fallback Title\n\nOld body');
    await actions.updateNodeContent('node-1', '# Latest body', { publishLocal: false });
    resolveTitleMutation();
    const applied = await titlePromise;

    expect(applied).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Latest body',
      title: 'Fallback Title'
    });
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
