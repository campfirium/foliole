import { open } from 'node:fs/promises';

import { readEpubArchiveIndex as readIndex } from '../../lib/core/import/epub/epubArchive.js';
export type { EpubZipEntry } from '../../lib/core/import/epub/epubArchive.js';
export async function readEpubArchiveIndex(filePath: string) {
  const file = await open(filePath, 'r');
  try {
    return await readIndex({ size: (await file.stat()).size, async read(offset, length) {
      const bytes = new Uint8Array(length);
      let done = 0;
      while (done < length) {
        const result = await file.read(bytes, done, length - done, offset + done);
        if (!result.bytesRead) throw new Error('EPUB import failed: truncated ZIP entry');
        done += result.bytesRead;
      }
      return bytes;
    } });
  } finally { await file.close(); }
}
