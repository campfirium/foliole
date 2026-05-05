import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

const { loadRuntimeReadwiseBookEpub, loadRuntimeReadwiseBooksInventory } = vi.hoisted(() => ({
  loadRuntimeReadwiseBookEpub: vi.fn(),
  loadRuntimeReadwiseBooksInventory: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory
}));

beforeEach(() => {
  loadRuntimeReadwiseBookEpub.mockReset();
  loadRuntimeReadwiseBooksInventory.mockReset();
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-a',
    epub_path: '/tmp/Book A.epub',
    status: 'selected',
    title: 'Book A'
  });
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
});

it('shows the import management navigation shell without readwise settings controls', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Import management navigation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader settings')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Readwise Reader settings' })).not.toBeInTheDocument();
});

it('switches the content container when a navigation item is selected', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  expect(screen.getByRole('heading', { name: 'Readwise Books' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Articles' }));
  expect(screen.getByRole('heading', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByText('Readwise article content will appear here once the list view is ready.')).toBeInTheDocument();
});

it('closes import management from the header close button', () => {
  const onOpenChange = vi.fn();

  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);
  fireEvent.click(screen.getByRole('button', { name: 'Close import management' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});
