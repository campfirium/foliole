import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';
import { createWorkspaceNodeActionsFixture } from '../../store/workspaceStoreNodeActions.test-support';

import { runNodeCreationWithEditorFocus } from './runNodeCreationWithEditorFocus';

afterEach(() => { vi.unstubAllGlobals(); });

it.each(['node', 'library'])('does not reclaim focus after leaving and returning to the same %s', async change => {
  const state = createWorkspaceNodeActionsFixture();
  state.nodesById.created = { ...state.nodesById['node-1']!, id: 'created' };
  state.nodeOrder.push('created');
  useWorkspaceStore.setState({ ...state, libraryScope: 'original' });
  let release!: () => void;
  const receipt = new Promise<void>(resolve => { release = resolve; });
  const focus = vi.fn();
  const creating = runNodeCreationWithEditorFocus({ create: async () => {
    useWorkspaceStore.setState({ activeNodeId: 'created' });
    await receipt;
    return 'created';
  }, focus });
  if (change === 'node') {
    useWorkspaceStore.setState({ activeNodeId: 'node-1' });
    useWorkspaceStore.setState({ activeNodeId: 'created' });
  } else {
    useWorkspaceStore.setState({ libraryScope: 'other' });
    useWorkspaceStore.setState({ libraryScope: 'original' });
  }
  release();
  expect(await creating).toBe('created');
  expect(focus).not.toHaveBeenCalled();
});
