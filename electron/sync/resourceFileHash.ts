import { createHash } from 'node:crypto';

import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

export async function hashResourceFile(filePath: string) {
  const digest = createHash('sha256');
  for await (const bytes of readFramedSyncFileChunks(filePath)) digest.update(bytes);
  return digest.digest('hex');
}
