// @vitest-environment node

import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { expect, it } from 'vitest';

import { deflateSyncPackDatabase } from './syncPackFileCompression.js';

it('keeps zlib bytes and both hashes stable when the database is streamed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pack-deflate-'));
  try {
    const database = Buffer.concat([randomBytes(256 * 1024), Buffer.alloc(256 * 1024, 9)]);
    const input = path.join(root, 'incoming.db');
    const output = path.join(root, 'incoming.db.deflate');
    await fs.writeFile(input, database);
    const result = await deflateSyncPackDatabase(input, output);
    const compressed = await fs.readFile(output);
    const sha = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    expect(compressed).toEqual(deflateSync(database));
    expect(result).toEqual({
      compressed: { bytes: compressed.length, sha256: sha(compressed) },
      raw: { bytes: database.length, sha256: sha(database) }
    });
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
