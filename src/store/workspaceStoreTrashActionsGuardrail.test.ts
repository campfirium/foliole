import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function expectCommandsOnly(invoke: ReturnType<typeof vi.fn>, expected: string) {
  const commands = invoke.mock.calls.map((call) => call[0]);
  expect(commands).toEqual([expected]);
  expect(commands).not.toContain('save_workspace_state');
}

function expectCommandsWithoutWorkspacePersist(invoke: ReturnType<typeof vi.fn>, expected: string[]) {
  const commands = invoke.mock.calls.map((call) => call[0]);
  expect(commands).toEqual(expected);
  expect(commands).not.toContain('save_workspace_state');
}

function createRuntimeInvoke(
  handler: (command: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown
) {
  return vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === 'create_folder' || command === 'create_topic' || command === 'create_item') {
      return {
        activeNodeId: (payload?.activeNodeId as string | null | undefined) ?? payload?.nodeId,
        createdNodeIds: [payload?.nodeId],
        nodeOrder: payload?.nodeOrder ?? [payload?.nodeId],
        nodes: [payload]
      };
    }
    return handler(command, payload);
  });
}

describe('workspace trash runtime guardrail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteNode uses soft_delete_nodes only and never save_workspace_state', async () => {
    const invoke = createRuntimeInvoke((command, payload?: { nodeIds?: string[] }) =>
      command === 'soft_delete_nodes' ? { deletedNodeIds: payload?.nodeIds ?? [] } : null
    );
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const seedNodeId = (await actions.createRootNode(''))!;
    const childNodeId = (await actions.createChildNode(seedNodeId, 'child'))!;

    vi.clearAllMocks();
    await actions.deleteNode(childNodeId);

    expectCommandsOnly(invoke, 'soft_delete_nodes');
  });

  it('restoreNode uses restore_nodes only and never save_workspace_state', async () => {
    const invoke = createRuntimeInvoke((command, payload?: { nodeIds?: string[] }) =>
      command === 'soft_delete_nodes'
        ? { deletedNodeIds: payload?.nodeIds ?? [] }
        : command === 'restore_nodes'
          ? { restoredNodeIds: payload?.nodeIds ?? [], skippedConflicts: [] }
          : null
    );
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const seedNodeId = (await actions.createRootNode(''))!;
    const childNodeId = (await actions.createChildNode(seedNodeId, 'child'))!;
    await actions.deleteNode(childNodeId);
    vi.clearAllMocks();
    await actions.restoreNode(childNodeId);

    expectCommandsOnly(invoke, 'restore_nodes');
  });

  it('deleteNodePermanently uses delete_nodes_permanently only and never save_workspace_state', async () => {
    const invoke = createRuntimeInvoke((command, payload?: { nodeIds?: string[]; nodeOrder?: string[] }) =>
      command === 'delete_nodes_permanently'
        ? { nodeOrder: payload?.nodeOrder ?? [], removedNodeIds: payload?.nodeIds ?? [] }
        : null
    );
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const rootNodeId = (await actions.createRootNode('Root 2'))!;

    vi.clearAllMocks();
    await actions.deleteNodePermanently(rootNodeId);

    expectCommandsWithoutWorkspacePersist(invoke, ['delete_nodes_permanently', 'load_removed_sources']);
  });
});
