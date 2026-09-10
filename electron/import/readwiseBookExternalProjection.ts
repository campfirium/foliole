import fs from 'node:fs/promises';
import path from 'node:path';

import { buildReadwiseBookPlaceholderContent } from './readwiseBookNodes.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { upsertReadwiseExternalDocument } from './readwiseExternalDocuments.js';

type ReadwiseBook = ReadwiseBooksInventory['books'][number];

export async function upsertReadwiseBookExternalProjection(input: {
  book: ReadwiseBook;
  inventory: ReadwiseBooksInventory;
  sourceName: string;
  indexedAt: string;
  sourceSignature?: { mtimeMs: number; sizeBytes: number };
}) {
  const filePath = input.book.fullDocumentMarkdownPath ?? input.book.highlightMarkdownPath;
  const content = filePath
    ? await fs.readFile(filePath, 'utf8')
    : buildReadwiseBookPlaceholderContent(input.book);
  upsertReadwiseExternalDocument({
    content,
    indexedAt: input.indexedAt,
    kind: 'books',
    primaryPath: input.inventory.fullDocumentDirectoryPath,
    source: {
      adapterId: 'markdown_directory',
      filePath: filePath ?? path.join(input.inventory.fullDocumentDirectoryPath, input.sourceName),
      kind: 'markdown',
      mtimeMs: input.sourceSignature?.mtimeMs ?? Date.parse(input.indexedAt),
      sizeBytes: input.sourceSignature?.sizeBytes ?? Buffer.byteLength(content),
      sourceName: input.sourceName
    }
  });
}
