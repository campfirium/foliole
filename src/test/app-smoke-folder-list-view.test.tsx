import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows a folder list shell when an ordinary folder is selected', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({
        id: 'folder-1',
        kind: 'folder',
        title: 'Project folder',
        content: 'This folder should not render as normal prose.'
      }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Child note',
        content: '# Child note'
      })
    }
  }));

  render(<App />);

  expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
  expect(screen.getByText('1 item')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Child note' })).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});

it('opens the selected child content when a folder list item is clicked', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({
        id: 'folder-1',
        kind: 'folder',
        title: 'Project folder',
        content: 'This folder should not render as normal prose.'
      }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Child note',
        content: '# Child note\n\nBody content'
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Child note' }));

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('note-1');
    expect(screen.queryByRole('region', { name: 'Folder list view' })).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-value')).toHaveValue('# Child note\n\nBody content');
  });
});

it('still shows the normal document view for content nodes', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'note-1',
    nodeOrder: ['folder-1', 'note-1'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Child note',
        content: '# Child note\n\nBody content'
      })
    }
  }));

  render(<App />);

  expect(useWorkspaceStore.getState().activeNodeId).toBe('note-1');
  expect(screen.queryByRole('region', { name: 'Folder list view' })).not.toBeInTheDocument();
  expect(screen.getByTestId('editor-value')).toHaveValue('# Child note\n\nBody content');
});

it('shows an empty state for empty folders', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Empty folder', content: '' })
    }
  }));

  render(<App />);

  expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
  expect(screen.getByText('0 items')).toBeInTheDocument();
  expect(screen.getByText('This folder is empty')).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});
