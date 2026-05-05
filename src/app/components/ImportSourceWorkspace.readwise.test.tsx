import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

const { loadRuntimeReadwiseBooksInventory, resetRuntimeReadwiseBookImport } = vi.hoisted(() => ({
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  resetRuntimeReadwiseBookImport: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport
}));

function seedResetResult() {
  resetRuntimeReadwiseBookImport.mockResolvedValue({
    book_key: 'book-a',
    content: '# Book A\n\n## Current status\n- Has highlights\n- EPUB missing\n- Book import pending\n',
    node_id: 'node-book-a',
    removed_node_ids: ['node-book-a-chapter-1'],
    status: 'reset',
    title: 'Book A',
    updated_at: '2026-04-04T10:00:00.000Z'
  });
}

function seedBooksInventory() {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({
    books: [
      {
        annotationStatus: 'has_highlights',
        bookKey: 'book-a',
        epubPath: '/tmp/Book A.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Book A.md',
        generatedNodeId: 'node-book-a',
        highlightMarkdownPath: '/tmp/Book A Highlights.md',
        importStatus: 'completed',
        nodeStatus: 'generated',
        title: 'Book A'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  });
}

function seedWorkspaceTree() {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['special-inbox', 'node-book-a', 'node-book-a-chapter-1'],
    nodesById: {
      ...useWorkspaceStore.getState().nodesById,
      'node-book-a': {
        ...seedNode,
        id: 'node-book-a',
        parentNodeId: 'special-inbox',
        title: 'Book A',
        content: '# Book A imported',
        reveal: 'done',
        hasReveal: true
      },
      'node-book-a-chapter-1': {
        ...seedNode,
        id: 'node-book-a-chapter-1',
        parentNodeId: 'node-book-a',
        title: 'Chapter 1',
        content: 'Chapter body',
        reveal: null
      }
    }
  });
}

beforeEach(() => {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-04T00:00:00.000Z')));
  loadRuntimeReadwiseBooksInventory.mockReset();
  resetRuntimeReadwiseBookImport.mockReset();
  seedResetResult();
  seedBooksInventory();
  seedWorkspaceTree();
});

it('starts on Inbox and marks the active navigation item', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('Inbox page')).toBeInTheDocument();
});

it('moves between readwise content pages from the left navigation', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Readwise Books page')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Articles' }));
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Readwise Articles page')).toBeInTheDocument();
});

it('resets the book import, closes the panel, and returns to the node when the button is clicked', async () => {
  const onOpenChange = vi.fn();
  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Re-import' }));

  await waitFor(() => {
    expect(resetRuntimeReadwiseBookImport).toHaveBeenCalledWith('node-book-a');
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-book-a');
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(useWorkspaceStore.getState().nodesById['node-book-a']?.reveal).toBeNull();
  expect(useWorkspaceStore.getState().nodesById['node-book-a']?.content).toContain('EPUB missing');
  expect(useWorkspaceStore.getState().nodesById['node-book-a-chapter-1']).toBeUndefined();
});
