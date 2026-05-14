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

function chooseFolderSort(label: 'Last opened' | 'Date modified') {
  const folderListView = screen.getByRole('region', { name: 'Folder list view' });
  fireEvent.keyDown(within(folderListView).getByRole('button', { name: /Sort list by / }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
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
  expect(screen.getByRole('heading', { level: 2, name: 'Project folder' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1');
  expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
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

it('sorts folder items by date modified by default', () => {
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

it('switches to last opened sorting and keeps folder open until a topic is opened', async () => {
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

  chooseFolderSort('Last opened');

  expect(getFolderListTitles()).toEqual(['Alpha', 'Alpha', 'Beta']);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('folder-1');

  fireEvent.click(screen.getAllByRole('button', { name: 'Open Alpha' })[0]!);

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('note-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('# Alpha\n\nBody alpha first');
  });
});

it('supports date last opened sorting from recent to old', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1', 'note-2', 'note-3'],
    nodeViewById: {
      ...state.nodeViewById,
      'note-1': { scrollTop: 20, selection: { from: 1, to: 1 }, updatedAt: '2026-04-01T09:00:00.000Z' },
      'note-2': { scrollTop: 20, selection: { from: 1, to: 1 }, updatedAt: '2026-04-03T09:00:00.000Z' }
    },
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Opened earlier',
        content: '# Opened earlier\n\nBody only',
        updatedAt: '2026-04-03T09:00:00.000Z'
      }),
      'note-2': createNode({
        id: 'note-2',
        parentNodeId: 'folder-1',
        title: 'Opened latest',
        content: '# Opened latest\n\nBody only',
        updatedAt: '2026-04-02T09:00:00.000Z'
      }),
      'note-3': createNode({
        id: 'note-3',
        parentNodeId: 'folder-1',
        title: 'Never opened',
        content: '# Never opened\n\nMore body only',
        updatedAt: '2026-04-01T09:00:00.000Z'
      })
    }
  }));

  render(<App />);

  chooseFolderSort('Last opened');

  expect(getFolderListTitles()).toEqual(['Opened latest', 'Opened earlier', 'Never opened']);
  expect(screen.getByTestId('folder-list-date-note-2')).toHaveTextContent('2026-04-03');
  expect(screen.getByTestId('folder-list-date-note-3')).toHaveTextContent('Never opened');
});

it('falls back to the empty summary copy when a child node has no usable body text', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Empty child',
        content: ''
      })
    }
  }));

  render(<App />);

  expect(screen.getByTestId('folder-list-excerpt-note-1')).toHaveTextContent('');
});
