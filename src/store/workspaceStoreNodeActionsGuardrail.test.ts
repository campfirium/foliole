import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createWorkspaceFixture(): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
  return {
    ...initial,
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
    openNode: () => null,
    resetLayout: () => undefined,
    setNodeViewState: () => undefined,
    setDocumentMaxWidth: () => undefined,
    setListWidth: () => undefined,
    setListCollapsed: () => undefined,
    setRightSidebarWidth: () => undefined,
    setRightSidebarCollapsed: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: () => undefined,
    updateNodeContent: () => undefined,
    updateNodeReveal: () => undefined,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    relearnNode: () => false,
    startReviewSession: () => false,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: () => false,
    deferReviewItem: () => false,
    dismissReviewItem: () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    restoreNode: () => undefined,
    deleteNodePermanently: () => undefined,
    createRootNode: () => 'unused',
    createChildNode: () => 'unused',
    createHighlightNodeFromSelection: () => null,
    createQANodeFromSelection: () => null,
    moveNode: () => false,
    moveNodes: () => false
  };
}

function createSetStateHarness(initialState: WorkspaceState) {
  let state = initialState;
  const setState = (partial: WorkspaceSetInput) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  return {
    setState,
    getState: () => state
  };
}

function getInvokedCommands(invoke: ReturnType<typeof vi.fn>): string[] {
  return invoke.mock.calls.map((call) => call[0] as string);
}

function expectNoWorkspacePersist(invoke: ReturnType<typeof vi.fn>) {
  expect(getInvokedCommands(invoke)).not.toContain('save_workspace_state');
}

describe('workspace node actions runtime guardrail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateNodeContent uses update_node_content only and never save_workspace_state', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', '# Updated title\n\nBody');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_content']);
    expectNoWorkspacePersist(invoke);
  });

  it('createChildNode uses sqlite commands and never save_workspace_state', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.createChildNode('node-1', 'Child body');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_content', 'replace_node_order']);
    expectNoWorkspacePersist(invoke);
  });

  it('moveNode uses sqlite commands and never save_workspace_state', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const rootNodeId = actions.createRootNode('Root B');

    vi.clearAllMocks();
    actions.moveNode(rootNodeId, 'node-1');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_content', 'replace_node_order']);
    expectNoWorkspacePersist(invoke);
  });

  it('updateNodeReveal uses update_node_reveal only and never save_workspace_state', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const node = harness.getState().nodesById['node-1'];
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': { ...node, reveal: 'Old reveal' }
      }
    });

    actions.updateNodeReveal('node-1', 'New reveal');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_reveal']);
    expectNoWorkspacePersist(invoke);
  });
});
