import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

function getFolderListTitles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

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

it('sorts folder items by updated date descending by default', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1', 'note-2', 'note-3'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Old note',
        content: '# Old note',
        updatedAt: '2026-04-01T09:00:00.000Z'
      }),
      'note-2': createNode({
        id: 'note-2',
        parentNodeId: 'folder-1',
        title: 'Newest note',
        content: '# Newest note',
        updatedAt: '2026-04-03T09:00:00.000Z'
      }),
      'note-3': createNode({
        id: 'note-3',
        parentNodeId: 'folder-1',
        title: 'Middle note',
        content: '# Middle note',
        updatedAt: '2026-04-02T09:00:00.000Z'
      })
    }
  }));

  render(<App />);

  expect(getFolderListTitles()).toEqual(['Newest note', 'Middle note', 'Old note']);
});

it('switches to title sorting and keeps folder open until an item is opened', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1', 'note-2', 'note-3'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Beta',
        content: '# Beta\n\nBody beta',
        updatedAt: '2026-04-01T09:00:00.000Z'
      }),
      'note-2': createNode({
        id: 'note-2',
        parentNodeId: 'folder-1',
        title: 'Alpha',
        content: '# Alpha\n\nBody alpha first',
        updatedAt: '2026-04-03T09:00:00.000Z'
      }),
      'note-3': createNode({
        id: 'note-3',
        parentNodeId: 'folder-1',
        title: 'Alpha',
        content: '# Alpha\n\nBody alpha second',
        updatedAt: '2026-04-02T09:00:00.000Z'
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Title' }));

  expect(getFolderListTitles()).toEqual(['Alpha', 'Alpha', 'Beta']);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('folder-1');

  fireEvent.click(screen.getAllByRole('button', { name: 'Open Alpha' })[0]!);

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('note-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('# Alpha\n\nBody alpha first');
  });
});

it('keeps author sorting stable when some items have no author metadata', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1', 'note-2', 'note-3'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'No author B',
        content: '# No author B\n\nBody only',
        updatedAt: '2026-04-03T09:00:00.000Z'
      }),
      'note-2': createNode({
        id: 'note-2',
        parentNodeId: 'folder-1',
        title: 'Named author',
        content: '---\nauthor: Ada\n---\n# Named author\n\nBody only',
        updatedAt: '2026-04-02T09:00:00.000Z'
      }),
      'note-3': createNode({
        id: 'note-3',
        parentNodeId: 'folder-1',
        title: 'No author A',
        content: '# No author A\n\nMore body only',
        updatedAt: '2026-04-01T09:00:00.000Z'
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Author' }));

  expect(getFolderListTitles()).toEqual(['Named author', 'No author A', 'No author B']);
  expect(screen.getByTestId('folder-list-author-note-2')).toHaveTextContent('Ada');
  expect(screen.getByTestId('folder-list-author-note-1')).toHaveAttribute('aria-label', 'Author unavailable');
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
