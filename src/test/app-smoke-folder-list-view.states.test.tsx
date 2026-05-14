import { render, screen, waitFor, within } from '@testing-library/react';
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

it('keeps default date-modified display and sorting on the same fallback field chain', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-1',
    nodeOrder: ['folder-1', 'note-1', 'note-2'],
    nodesById: {
      ...state.nodesById,
      'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Project folder', content: '' }),
      'note-1': createNode({
        id: 'note-1',
        parentNodeId: 'folder-1',
        title: 'Created fallback',
        content: '# Created fallback',
        createdAt: '2026-04-03T09:00:00.000Z',
        updatedAt: ''
      }),
      'note-2': createNode({
        id: 'note-2',
        parentNodeId: 'folder-1',
        title: 'Updated value',
        content: '# Updated value',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-02T09:00:00.000Z'
      })
    }
  }));

  render(<App />);

  expect(getFolderListTitles()).toEqual(['Updated value', 'Created fallback']);
  expect(screen.getByTestId('folder-list-date-note-1')).toHaveTextContent('2026-04-03');
  expect(screen.getByTestId('folder-list-date-note-2')).toHaveTextContent('2026-04-01');
});

it('still shows the normal document view for content nodes', async () => {
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
  await waitFor(() => {
    expect(screen.getByTestId('editor-value')).toHaveValue('# Child note\n\nBody content');
  });
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
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('0');
  expect(screen.getByText('This folder is empty')).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});
