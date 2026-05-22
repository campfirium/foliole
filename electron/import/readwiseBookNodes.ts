import { createHash } from 'node:crypto';

import { appendFilePlaceholderHighlights } from '../../lib/core/import/filePlaceholderContent.js';

import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

function formatAnnotationStatus(status: ReadwiseBookInventoryItem['annotationStatus']) {
  return status === 'has_highlights' ? 'Highlights available' : 'No highlights yet';
}

function formatEpubStatus(status: ReadwiseBookInventoryItem['epubStatus']) {
  return status === 'received' ? 'Original file received' : 'Original file missing';
}

function formatImportStatus(status: ReadwiseBookInventoryItem['importStatus']) {
  return status === 'completed' ? 'Book import completed' : 'Book import pending';
}

export function buildReadwiseBookPlaceholderNodeId(bookKey: string) {
  const digest = createHash('sha256').update(`readwise-book\u001f${bookKey}`).digest('hex').slice(0, 24);
  return `node-readwise-book-${digest}`;
}

function buildPendingReadwiseBookPlaceholderContent(book: ReadwiseBookInventoryItem) {
  const lines = [
    `# ${book.title}`,
    '',
    'Full text of this document omitted because this document is an EPUB'
  ];
  if (book.downloadUrl) {
    lines.push('', `[Download original file ->](${book.downloadUrl})`);
  }
  const content = [book.metadataFrontmatter, lines.join('\n')].filter(Boolean).join('\n');
  return appendFilePlaceholderHighlights(content, book.highlights, { summary: book.summary });
}

export function buildReadwiseBookPlaceholderContent(book: ReadwiseBookInventoryItem) {
  if (book.importStatus === 'pending') {
    return buildPendingReadwiseBookPlaceholderContent(book);
  }
  return [
    `# ${book.title}`,
    '',
    '## Current status',
    `- ${formatAnnotationStatus(book.annotationStatus)}`,
    `- ${formatEpubStatus(book.epubStatus)}`,
    `- ${formatImportStatus(book.importStatus)}`,
    '',
    '## Next actions',
    '- Download original file*',
    '- Load original file*',
    '',
    '*In progress. These actions will be connected in a later task.*'
  ].join('\n');
}
