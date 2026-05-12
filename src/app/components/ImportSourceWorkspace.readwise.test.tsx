import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

const {
  loadRuntimeReadwiseBooksInventory,
  previewReadwiseReaderImportInRuntime,
  resetRuntimeReadwiseBookImport,
  loadRuntimePdfImportsInventory
} = vi.hoisted(() => ({
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  previewReadwiseReaderImportInRuntime: vi.fn(),
  resetRuntimeReadwiseBookImport: vi.fn(),
  loadRuntimePdfImportsInventory: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksRuntimeRepository', () => ({
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport
}));
vi.mock('../../shared/platform/pdfImportsRuntimeRepository', () => ({
  loadRuntimePdfImportsInventory
}));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  previewReadwiseReaderImportInRuntime
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
    nodeOrder: ['special-inbox', 'node-inbox-older', 'node-book-a', 'node-book-a-chapter-1'],
    nodesById: {
      ...useWorkspaceStore.getState().nodesById,
      'node-inbox-older': {
        ...seedNode,
        id: 'node-inbox-older',
        parentNodeId: 'special-inbox',
        title: 'Older Inbox Node',
        content: 'Older content',
        reveal: null
      },
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
  window.localStorage.clear();
  vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-04T00:00:00.000Z')));
  loadRuntimeReadwiseBooksInventory.mockReset();
  previewReadwiseReaderImportInRuntime.mockReset();
  resetRuntimeReadwiseBookImport.mockReset();
  loadRuntimePdfImportsInventory.mockReset();
  loadRuntimePdfImportsInventory.mockResolvedValue({
    items: [],
    scannedAt: '2026-04-04T10:00:00.000Z'
  });
  previewReadwiseReaderImportInRuntime.mockResolvedValue({
    entries: [
      {
        destination: 'inbox',
        detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
        detected_highlight_count: 3,
        highlight_type: 'with_highlights',
        source_kind: 'articles',
        source_path: '/Readwise/Articles/Article A.md',
        status: 'blocked_deleted'
      },
      {
        destination: 'external',
        detail: null,
        detected_highlight_count: 0,
        highlight_type: 'without_highlights',
        source_kind: 'articles',
        source_path: '/Readwise/Articles/Article B.md',
        status: 'new'
      },
      {
        destination: 'external',
        detail: null,
        detected_highlight_count: 5,
        highlight_type: 'with_highlights',
        source_kind: 'books',
        source_path: '/Readwise/Books/Book A.md',
        status: 'unchanged'
      }
    ],
    external_count: 2,
    failed_count: 0,
    inbox_count: 1,
    off_count: 0,
    previewed_at: '2026-04-04T10:00:00.000Z',
    readwise_root_path: '/Readwise',
    total_count: 3,
    with_highlights_count: 2,
    without_highlights_count: 1,
    write_count: 1
  });
  seedResetResult();
  seedBooksInventory();
  seedWorkspaceTree();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('starts on Recent Imports and marks the active navigation item', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });
  expect(screen.getByRole('button', { name: 'Recent Imports' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Inbox History' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('Recent Imports page')).toBeInTheDocument();
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
  await waitFor(() => {
    expect(screen.getByText('Article A')).toBeInTheDocument();
  });
  expect(screen.getByText('Article B')).toBeInTheDocument();
  expect(screen.getByText('Deleted')).toBeInTheDocument();
  expect(screen.getByText('Not loaded')).toBeInTheDocument();
});

it('opens the selected book node from the title click and closes the panel', async () => {
  const onOpenChange = vi.fn();
  const onSelectNode = vi.fn();
  render(<ImportSourceWorkspace onOpenChange={onOpenChange} onSelectNode={onSelectNode} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Book A' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Book A' }));

  expect(onSelectNode).toHaveBeenCalledWith('node-book-a');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('resets the book import, closes the panel, and returns to the node when the button is clicked', async () => {
  const onOpenChange = vi.fn();
  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(resetRuntimeReadwiseBookImport).toHaveBeenCalledWith('node-book-a');
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-book-a');
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(useWorkspaceStore.getState().nodesById['node-book-a']?.reveal).toBeNull();
  expect(useWorkspaceStore.getState().nodesById['node-book-a-chapter-1']).toBeUndefined();
  const nodeOrder = useWorkspaceStore.getState().nodeOrder;
  expect(nodeOrder.indexOf('node-book-a')).toBeLessThan(nodeOrder.indexOf('node-inbox-older'));
});

it('reloads readwise books when reopening the import panel', async () => {
  const view = render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });
  expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalledTimes(2);

  view.rerender(<ImportSourceWorkspace onOpenChange={() => undefined} open={false} />);
  view.rerender(<ImportSourceWorkspace onOpenChange={() => undefined} open />);
  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalledTimes(3);
  });
});
