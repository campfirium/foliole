import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

function expectCurrentFolderPanel() {
  return screen.getByRole('complementary', { name: 'Current folder contents' });
}

function buildDualTreeSwitchState() {
  return (state: ReturnType<typeof useWorkspaceStore.getState>) => ({
    activeNodeId: 'special-inbox',
    nodeOrder: ['special-inbox', 'folder-case', 'topic-inbox', 'topic-inbox-child', 'topic-case', 'topic-case-child'],
    nodesById: {
      ...state.nodesById,
      'folder-case': createNode({
        id: 'folder-case',
        kind: 'folder',
        title: 'Case',
        content: ''
      }),
      'topic-inbox': createNode({
        id: 'topic-inbox',
        kind: 'topic',
        parentNodeId: 'special-inbox',
        title: 'Inbox topic',
        content: '# Inbox topic'
      }),
      'topic-inbox-child': createNode({
        id: 'topic-inbox-child',
        kind: 'topic',
        parentNodeId: 'topic-inbox',
        title: 'Inbox child',
        content: '# Inbox child'
      }),
      'topic-case': createNode({
        id: 'topic-case',
        kind: 'topic',
        parentNodeId: 'folder-case',
        title: 'Case topic',
        content: '# Case topic'
      }),
      'topic-case-child': createNode({
        id: 'topic-case-child',
        kind: 'topic',
        parentNodeId: 'topic-case',
        title: 'Case child',
        content: '# Case child'
      })
    }
  });
}

it('shows folders in the left tree and topics in the adjacent topic tree', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-projects',
    nodeOrder: ['folder-projects', 'folder-research', 'topic-overview', 'topic-child', 'item-card'],
    nodesById: {
      ...state.nodesById,
      'folder-projects': createNode({
        id: 'folder-projects',
        kind: 'folder',
        title: 'Projects',
        content: ''
      }),
      'folder-research': createNode({
        id: 'folder-research',
        kind: 'folder',
        parentNodeId: 'folder-projects',
        title: 'Research',
        content: ''
      }),
      'topic-overview': createNode({
        id: 'topic-overview',
        kind: 'topic',
        parentNodeId: 'folder-projects',
        title: 'Overview',
        content: '# Overview'
      }),
      'topic-child': createNode({
        id: 'topic-child',
        kind: 'topic',
        parentNodeId: 'topic-overview',
        title: 'Nested idea',
        content: '# Nested idea'
      }),
      'item-card': createNode({
        id: 'item-card',
        kind: 'item',
        parentNodeId: 'folder-projects',
        title: 'Key Card',
        content: 'Prompt',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  expect(within(listPanel).getByRole('treeitem', { name: 'Projects' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Research' })).toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Overview' })).not.toBeInTheDocument();

  const currentFolderPanel = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Overview' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Nested idea' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Key Card' })).toBeInTheDocument();
  expect(within(currentFolderPanel).queryByRole('treeitem', { name: 'Research' })).not.toBeInTheDocument();
});

it('keeps the dual tree visible when inbox is selected', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'special-inbox',
    nodeOrder: ['special-inbox', 'topic-inbox', 'topic-child'],
    nodesById: {
      ...state.nodesById,
      'topic-inbox': createNode({
        id: 'topic-inbox',
        kind: 'topic',
        parentNodeId: 'special-inbox',
        title: 'Inbox topic',
        content: '# Inbox topic'
      }),
      'topic-child': createNode({
        id: 'topic-child',
        kind: 'topic',
        parentNodeId: 'topic-inbox',
        title: 'Inbox child',
        content: '# Inbox child'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  expect(within(listPanel).getByRole('treeitem', { name: 'Inbox' })).toBeInTheDocument();

  const currentFolderPanel = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Inbox topic' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Inbox child' })).toBeInTheDocument();
});

it('keeps the dual tree visible while switching between inbox, folder, and topic selections', () => {
  useWorkspaceStore.setState(buildDualTreeSwitchState());

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });

  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Inbox topic' })).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Inbox child' })).toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Case' }));
  expect(expectCurrentFolderPanel()).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Case topic' })).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Case child' })).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).queryByRole('treeitem', { name: 'Inbox topic' })).not.toBeInTheDocument();

  fireEvent.click(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Case child' }));
  expect(expectCurrentFolderPanel()).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Case topic' })).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Case child' })).toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Inbox' }));
  expect(expectCurrentFolderPanel()).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Inbox topic' })).toBeInTheDocument();
  expect(within(expectCurrentFolderPanel()).getByRole('treeitem', { name: 'Inbox child' })).toBeInTheDocument();
});
