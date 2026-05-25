import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z')));
}

function getInvokedCommands(invoke: ReturnType<typeof vi.fn>): string[] {
  return invoke.mock.calls.map((call) => call[0] as string);
}

describe('workspace persistence runtime guardrail', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetWorkspaceState();
    vi.clearAllMocks();
  });

  it('does not issue legacy workspace JSON runtime commands during workspace mutations', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await useWorkspaceStore.getState().updateNodeContent('node-1', 'Persisted markdown');
    const createdNodeId = (await useWorkspaceStore.getState().createRootNode('Trash me'))!;
    useWorkspaceStore.getState().deleteNode(createdNodeId);
    await Promise.resolve();

    const commands = getInvokedCommands(invoke);
    expect(commands).not.toContain('save_workspace_state');
    expect(commands).not.toContain('load_workspace_state');
    expect(commands).not.toContain('clear_workspace_state');
  });
});
