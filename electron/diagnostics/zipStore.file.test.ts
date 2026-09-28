// @vitest-environment node

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { writeStoredZip, writeStoredZipFromFile } from './zipStore.js';

it('writes the same stored ZIP bytes while reading a file in bounded chunks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-zip-file-'));
  try {
    const body = randomBytes(1024 * 1024 + 31);
    const manifest = Buffer.from('{"format":"test"}');
    const bodyFilePath = path.join(root, 'body.deflate');
    const bufferedZip = path.join(root, 'buffered.zip');
    const streamedZip = path.join(root, 'streamed.zip');
    await fs.writeFile(bodyFilePath, body);
    await writeStoredZip(bufferedZip, [
      { name: 'manifest.json', content: manifest },
      { name: 'incoming.db.deflate', content: body }
    ]);
    await writeStoredZipFromFile({ bodyFilePath, bodyName: 'incoming.db.deflate',
      filePath: streamedZip, manifest });
    expect(await fs.readFile(streamedZip)).toEqual(await fs.readFile(bufferedZip));
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
