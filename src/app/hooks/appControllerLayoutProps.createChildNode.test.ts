import { expect, it, vi } from 'vitest';

import { createFlushBeforeCreateChildNode } from './appControllerLayoutProps';

function createHarness() {
  const focus = vi.fn();
  const createChildNode = vi.fn(async (parentNodeId: string): Promise<string | null> => `created-under-${parentNodeId}`);
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
