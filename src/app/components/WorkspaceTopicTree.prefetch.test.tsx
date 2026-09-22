import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const requestWorkspaceNodeDocumentPreload = vi.hoisted(() => vi.fn());

vi.mock('../../store/workspaceNodeDocumentPrefetch', () => ({
  requestWorkspaceNodeDocumentPreload
}));

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(id: string, title: string, parentNodeId: string | null) {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-09-22T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-09-22T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  requestWorkspaceNodeDocumentPreload.mockReset();
});

it('prefetches the first Inbox item in its displayed order', () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId={INBOX_NODE_ID}
      activeNodeId={INBOX_NODE_ID}
      itemIds={['inbox-b', 'inbox-a']}
      nodesById={{
        [INBOX_NODE_ID]: { ...createNode(INBOX_NODE_ID, 'Inbox', null), kind: 'folder', specialKind: 'inbox' },
        'inbox-a': createNode('inbox-a', 'Inbox A', INBOX_NODE_ID),
        'inbox-b': createNode('inbox-b', 'Inbox B', INBOX_NODE_ID)
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
      preserveItemOrder
    />
  );

  expect(requestWorkspaceNodeDocumentPreload).toHaveBeenCalledWith(['inbox-b']);
});

it('prefetches the item after the active Inbox item in displayed order', () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId={INBOX_NODE_ID}
      activeNodeId="inbox-b"
      itemIds={['inbox-b', 'inbox-a']}
      nodesById={{
        [INBOX_NODE_ID]: { ...createNode(INBOX_NODE_ID, 'Inbox', null), kind: 'folder', specialKind: 'inbox' },
        'inbox-a': createNode('inbox-a', 'Inbox A', INBOX_NODE_ID),
        'inbox-b': createNode('inbox-b', 'Inbox B', INBOX_NODE_ID)
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
      preserveItemOrder
    />
  );

  expect(requestWorkspaceNodeDocumentPreload).toHaveBeenCalledWith(['inbox-a']);
});

it('prefetches a topic only after hover or focus intent persists', async () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-a"
      itemIds={['topic-a', 'topic-b']}
      nodesById={{
        'topic-a': createNode('topic-a', 'Topic A', 'folder-a'),
        'topic-b': createNode('topic-b', 'Topic B', 'folder-a')
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
      preserveItemOrder
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const topicB = within(itemColumn).getByRole('treeitem', { name: 'Topic B' });
  expect(requestWorkspaceNodeDocumentPreload).not.toHaveBeenCalled();
  fireEvent.pointerOver(topicB);

  await vi.waitFor(() => {
    expect(requestWorkspaceNodeDocumentPreload).toHaveBeenCalledWith(['topic-b']);
  });

  requestWorkspaceNodeDocumentPreload.mockReset();
  fireEvent.focus(topicB);
  await vi.waitFor(() => {
    expect(requestWorkspaceNodeDocumentPreload).toHaveBeenCalledWith(['topic-b']);
  });
});

it('cancels hover prefetch when the pointer leaves before the intent delay', async () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-a"
      itemIds={['topic-a', 'topic-b']}
      nodesById={{
        'topic-a': createNode('topic-a', 'Topic A', 'folder-a'),
        'topic-b': createNode('topic-b', 'Topic B', 'folder-a')
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
      preserveItemOrder
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const topicB = within(itemColumn).getByRole('treeitem', { name: 'Topic B' });
  fireEvent.pointerOver(topicB);
  fireEvent.pointerOut(topicB);
  await new Promise((resolve) => globalThis.setTimeout(resolve, 250));

  expect(requestWorkspaceNodeDocumentPreload).not.toHaveBeenCalled();
});
