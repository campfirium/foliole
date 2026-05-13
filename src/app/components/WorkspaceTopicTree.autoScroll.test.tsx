import { render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(id: string, title: string) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function WorkspaceTopicTreeAutoScrollHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode('article-a', 'React Notes'),
    'article-b': createNode('article-b', 'Vue Notes')
  };

  useEffect(() => {
    setActiveNodeId('article-b');
  }, []);

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'article-b']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={setActiveNodeId}
    />
  );
}

beforeEach(() => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('scrolls the current folder item column to the externally selected node', async () => {
  render(<WorkspaceTopicTreeAutoScrollHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const vueRow = within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' });

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(vueRow, 'offsetTop', { configurable: true, value: 180 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(155));
});
