import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
import { consumeReadwiseOriginalFile } from './readwiseOriginalFileRequest.js';

export async function downloadReadwiseOriginalEpubFile(url: string, dependencies: ReadwiseApiFetchDependencies = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-epub-'));
  const filePath = path.join(root, 'original.epub');
  try {
    await consumeReadwiseOriginalFile(url, 'epub', dependencies, async (response, idle) => {
      const disk = await statfs(root);
      const available = disk.bavail * disk.bsize;
      const budget = Math.max(0, available - Math.min(64 * 1024 * 1024, available / 20));
      let size = 0;
      let prefix = Buffer.alloc(0);
      const check = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          idle.touch();
          size += chunk.length;
          if (size > budget) return callback(new Error('original_file_insufficient_disk_space'));
          if (prefix.length < 4) prefix = Buffer.concat([prefix, chunk.subarray(0, 4 - prefix.length)]);
          if (prefix.length === 4 && !prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
            return callback(new Error('original_file_signature_mismatch'));
          }
          callback(null, chunk);
        },
        flush(callback) { callback(prefix.length < 4 ? new Error('original_file_signature_mismatch') : null); }
      });
      await pipeline(Readable.fromWeb(response.body! as import('node:stream/web').ReadableStream<Uint8Array>),
        check, createWriteStream(filePath, { flags: 'wx', mode: 0o600 }), { signal: idle.signal });
    });
    return { filePath, dispose: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
