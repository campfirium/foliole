import { expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';
import { createWorkspaceNodeActionsFixture } from '../../store/workspaceStoreNodeActions.test-support';

import { createFlushBeforeCreateChildNode } from './appControllerLayoutProps';

function createHarness() {
  const focus = vi.fn();
  useWorkspaceStore.setState({ ...createWorkspaceNodeActionsFixture(), libraryScope: 'child-creation-test' });
  const createChildNode = vi.fn(async (parentNodeId: string): Promise<string | null> => {
    const id = `created-under-${parentNodeId}`;
    const state = useWorkspaceStore.getState();
    useWorkspaceStore.setState({ activeNodeId: id, nodeOrder: [...state.nodeOrder, id],
      nodesById: { ...state.nodesById, [id]: { ...state.nodesById['node-1']!, id } } });
    return id;
  });
  const handler = createFlushBeforeCreateChildNode({
    runtime: {
      editorRef: { current: { focus } as never },
      flushActiveEditorTransaction: vi.fn(() => false),
      flushPendingEditorDraft: vi.fn(),
      flushPendingEditorDraftImmediately: vi.fn(async () => true)
    },
    ws: {
      activeNodeId: 'active-topic',
      createChildNode
    }
  } as unknown as Parameters<typeof createFlushBeforeCreateChildNode>[0]);
  return { createChildNode, focus, handler };
}

it('focuses the body for blank topics created in a folder or under another topic', async () => {
  const harness = createHarness();

  await harness.handler('folder-a', '', 'topic');
  await harness.handler('topic-a', '', 'topic');

  expect(harness.createChildNode).toHaveBeenNthCalledWith(1, 'folder-a', '', 'topic');
  expect(harness.createChildNode).toHaveBeenNthCalledWith(2, 'topic-a', '', 'topic');
  expect(harness.focus).toHaveBeenCalledTimes(2);
});

it('does not steal focus for non-topic, prefilled, or failed creation', async () => {
  const harness = createHarness();

  await harness.handler('folder-a', '', 'folder');
  await harness.handler('topic-a', 'Prepared body', 'topic');
  harness.createChildNode.mockResolvedValueOnce(null);
  await harness.handler('topic-a', '', 'topic');

  expect(harness.focus).not.toHaveBeenCalled();
});
