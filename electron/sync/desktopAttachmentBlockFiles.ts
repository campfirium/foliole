import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createAttachmentBlockReceiver, type AttachmentBlockFiles,
  type AttachmentBlockResource } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { tryAcquireAttachmentReceiveOwner } from './attachmentReceiveOwner.js';
import { hashResourceFile } from './resourceFileHash.js';

function missing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function openPartial(file: string) {
  try { return await fs.open(file, 'r+'); }
  catch (error) {
    if (!missing(error)) throw error;
    return fs.open(file, 'wx+');
  }
}

async function verifyComplete(file: string, resource: AttachmentBlockResource) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size !== resource.byteLength ||
      await hashResourceFile(file) !== resource.storageKey.slice(0, 64)) {
      throw new Error('attachment_published_file_invalid');
    }
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

function createFiles(assetsDir: string,
  availability: AttachmentBlockFiles['availability'],
  exclusive: AttachmentBlockFiles['exclusive']): AttachmentBlockFiles {
  const partial = (hash: string) => path.join(assetsDir, `.attachment-${hash}.partial`);
  return {
    availability, exclusive,
    complete: resource => verifyComplete(path.join(assetsDir, resource.storageKey), resource),
    async partialLength(hash) {
      try { return (await fs.stat(partial(hash))).size; }
      catch (error) { if (missing(error)) return 0; throw error; }
    },
    async truncate(hash, length) {
      const file = await openPartial(partial(hash));
      try { await file.truncate(length); }
      finally { await file.close(); }
    },
    async append(hash, offset, bytes) {
      const file = await fs.open(partial(hash), 'r+');
      try {
        if ((await file.stat()).size !== offset) throw new Error('attachment_partial_length_changed');
        let written = 0;
        while (written < bytes.byteLength) {
          const result = await file.write(bytes, written, bytes.byteLength - written, offset + written);
          if (!result.bytesWritten) throw new Error('attachment_block_write_incomplete');
          written += result.bytesWritten;
        }
      } finally { await file.close(); }
    },
    verifyPartial: async hash => await hashResourceFile(partial(hash)) === hash,
    discardPartial: hash => fs.rm(partial(hash), { force: true }),
    async publish(resource) {
      const source = partial(resource.storageKey.slice(0, 64));
      const destination = path.join(assetsDir, resource.storageKey);
      try { await fs.link(source, destination); }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
        if (!await verifyComplete(destination, resource)) throw new Error('attachment_publish_destination_missing');
      }
      await fs.unlink(source);
    }
  };
}

/** Close drains active file operations before releasing the cross-process owner. */
export async function openDesktopAttachmentBlockReceiver(input: {
  libraryRoot: string; assetsDir: string; availability: AttachmentBlockFiles['availability'];
}) {
  const owner = tryAcquireAttachmentReceiveOwner(input.libraryRoot);
  if (owner.kind === 'busy') return owner;
  const active = new Map<string, Promise<void>>();
  let closing = false;
  const exclusive: AttachmentBlockFiles['exclusive'] = async (hash, execute) => {
    if (closing) throw new Error('attachment_receiver_closed');
    const previous = active.get(hash) ?? Promise.resolve();
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => pending);
    active.set(hash, tail);
    await previous;
    try { return await execute(); }
    finally { release(); if (active.get(hash) === tail) active.delete(hash); }
  };
  try {
    await fs.mkdir(input.assetsDir, { recursive: true });
    const receiver = createAttachmentBlockReceiver(createFiles(input.assetsDir, input.availability, exclusive));
    return { kind: 'acquired' as const, ...receiver, async close() {
      closing = true;
      await Promise.all(active.values());
      owner.close();
    } };
  } catch (error) { owner.close(); throw error; }
}
