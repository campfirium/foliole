import { createHash } from 'node:crypto';

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

export function buildReadwiseBookPlaceholderContent(book: ReadwiseBookInventoryItem) {
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
