import { act, fireEvent, render, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { getCurrentFolderPanel, getCurrentFolderTreeItem } from './app-smoke.shared';

function createTextAnchorLink(id: string, originalText: string, from = 0) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

async function createHighlightNode() {
  let createdNodeId: string | null = null;
  await act(async () => {
    createdNodeId = await useWorkspaceStore
      .getState()
      .createHighlightNodeFromSelection('node-1', 'Welcome', 'hl-1', createTextAnchorLink('hl-1', 'Welcome'));
  });
  return createdNodeId;
}

function openInboxWithExpandedTopics() {
  act(() => {
    useWorkspaceStore.setState({ activeNodeId: INBOX_NODE_ID });
  });
  const folderPanel = within(getCurrentFolderPanel());
  const expandButton = folderPanel.queryByRole('button', { name: 'Expand all topics' });
  if (expandButton) {
    fireEvent.click(expandButton);
  }
}

it('creates highlight node without leaving current node', async () => {
  render(<App />);
  const createdNodeId = await createHighlightNode();

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBe('node-1');
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
  expect(workspace.nodesById[createdNodeId]?.title).toBe('Welcome');
  expect(workspace.nodesById[createdNodeId]?.content).toBe('Welcome');

  openInboxWithExpandedTopics();

  expect(getCurrentFolderTreeItem('Welcome to Foliole')).toHaveAttribute('data-node-derived', 'false');
  expect(getCurrentFolderTreeItem('Welcome')).toHaveAttribute('data-node-derived', 'true');
});

it('keeps only top-level rows bold while lowering non-top-level row emphasis', async () => {
  render(<App />);
  const createdNodeId = await createHighlightNode();
  openInboxWithExpandedTopics();

  const regularRow = getCurrentFolderTreeItem('Welcome to Foliole');
  const derivedRow = getCurrentFolderTreeItem('Welcome');

  expect(regularRow).toHaveAttribute('data-node-emphasis', 'primary');
  expect(createdNodeId).toBeTruthy();
  expect(derivedRow).toHaveAttribute('data-node-emphasis', 'secondary');
  expect(regularRow.className).toContain('font-normal');
  expect(derivedRow.className).toContain('font-normal');
  expect(regularRow.querySelector('[data-node-icon]')).toBeInTheDocument();
  expect(derivedRow.querySelector('[data-node-icon]')).toBeInTheDocument();
});
