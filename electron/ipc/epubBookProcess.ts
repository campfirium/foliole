import { rmSync } from 'node:fs';
import { access } from 'node:fs/promises';

import { EpubArchiveEntries } from './epubArchiveEntries.js';
import { serializeStagedEpubBook } from './epubBookStaging.js';
import { buildRawEpubBook } from './epubImportBook.js';
import { epubImageFilePath } from './epubStagedContent.js';

let finished = false;
process.once('disconnect', () => {
  if (finished) return;
  const root = process.argv[4];
  if (root) rmSync(root, { recursive: true, force: true });
  process.exit(1);
});

async function run() {
  const [filePath, sourceName, root] = process.argv.slice(2);
  if (!filePath || !sourceName || !root) throw new Error('Missing EPUB process input');
  const book = await buildRawEpubBook(filePath, sourceName, root);
  const images = new Set([
    ...book.rootEmbeddedImages,
    ...book.nodes.flatMap((node) => node.embeddedImages)
  ].map(epubImageFilePath));
  const entries = await EpubArchiveEntries.open(filePath, root);
  for (const [name, imagePath] of entries.files) {
    if (images.has(imagePath)) {
      try { await access(imagePath); } catch { await entries.extract(name); }
    }
  }
  return serializeStagedEpubBook(book);
}

void run().then(
  (book) => { finished = true; process.send?.({ book }); process.disconnect?.(); },
  (error: unknown) => {
    finished = true;
    process.send?.({ error: error instanceof Error ? error.message : String(error) });
    process.disconnect?.();
  }
);
