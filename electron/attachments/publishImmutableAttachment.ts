import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Only a fully written, verified inode becomes visible at a content-addressed path. */
export async function publishImmutableAttachment(destination: string, expectedHash: string,
  write: (temporary: string) => Promise<void>) {
  try { await verify(destination, expectedHash); return false; }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.attachment-${randomUUID()}.tmp`);
  try {
    await write(temporary);
    await verify(temporary, expectedHash);
    try { await link(temporary, destination); return true; }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      await verify(destination, expectedHash);
      return false;
    }
  } finally { await rm(temporary, { force: true }); }
}

async function verify(file: string, expected: string) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  if (digest.digest('hex') !== expected) throw new Error('canonical_attachment_hash_mismatch');
}
