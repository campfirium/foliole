
import { createReadStream, createWriteStream } from 'node:fs';
import { rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw, crc32 } from 'node:zlib';

import type { EpubZipEntry } from './epubArchive.js';

export async function extractEpubEntry(filePath: string, entry: EpubZipEntry, outputPath: string, signal?: AbortSignal) {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`EPUB import failed: unsupported ZIP compression method ${entry.method}`);
  }
  const disk = await statfs(path.dirname(outputPath));
  // Preserve working room on the actual destination volume; this is not a book-size limit.
  const available = disk.bavail * disk.bsize;
  const diskBudget = Math.max(0, available - Math.min(64 * 1024 * 1024, available / 20));
  let size = 0;
  let crc = 0;
  const verify = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > entry.size) return callback(new Error('EPUB import failed: ZIP output exceeds declared size'));
      if (size > diskBudget) return callback(new Error('EPUB import failed: insufficient temporary disk space'));
      crc = crc32(chunk, crc);
      callback(null, chunk);
    },
    flush(callback) {
      callback(size !== entry.size || crc !== entry.crc
        ? new Error('EPUB import failed: ZIP size or checksum mismatch') : null);
    }
  });
  const source = entry.compressedSize === 0 ? Readable.from([]) : createReadStream(filePath, {
    start: entry.dataOffset, end: entry.dataOffset + entry.compressedSize - 1
  });
  try {
    const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
    if (entry.method === 8) await pipeline(source, createInflateRaw(), verify, output, { signal });
    else await pipeline(source, verify, output, { signal });
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}
