import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

const { loadRuntimeReadwiseBooksInventory } = vi.hoisted(() => ({
  loadRuntimeReadwiseBooksInventory: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBooksInventory
}));

beforeEach(() => {
  loadRuntimeReadwiseBooksInventory.mockReset();
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
