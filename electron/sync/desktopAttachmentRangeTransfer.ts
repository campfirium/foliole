import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AttachmentReceiveCheckpoint } from '../../lib/core/sync/attachmentReceiveCheckpoint.js';
import { ATTACHMENT_RANGE_BYTES } from '../../lib/platform/resourceAvailabilityContract.js';

import { hashResourceFile } from './resourceFileHash.js';

interface RangeResult { body: Buffer; totalBytes: number }

export async function receiveDesktopAttachmentRanges(args: {
  filePath: string; contentHash: string; expectedBytes?: number;
  checkpoint: AttachmentReceiveCheckpoint;
  requestRange: (offset: number) => Promise<RangeResult>;
}) {
  if (await hasVerifiedAttachment(args)) { await args.checkpoint.clear(); return; }
  await fs.mkdir(path.dirname(args.filePath), { recursive: true });
  const partial = `${args.filePath}.unverified`;
  const first = await args.requestRange(0);
  const total = first.totalBytes;
  if (!Number.isSafeInteger(total) || total < 0 ||
      args.expectedBytes !== undefined && total !== args.expectedBytes) {
    throw new Error('attachment_resource_length_changed');
  }
  if (first.body.length !== Math.min(ATTACHMENT_RANGE_BYTES, total)) {
    throw new Error('attachment_resource_range_invalid');
  }
  const handle = await fs.open(partial, 'r+').catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return fs.open(partial, 'w+', 0o600);
  });
  try {
    let offset = await verifiedPrefix(handle, first.body, total, await args.checkpoint.load(total));
    await args.checkpoint.save(total, offset);
    while (offset < total) {
      const segment = offset === 0 ? first : await args.requestRange(offset);
      if (segment.totalBytes !== total ||
          segment.body.length !== Math.min(ATTACHMENT_RANGE_BYTES, total - offset)) {
        throw new Error('attachment_resource_range_invalid');
      }
      let written = 0;
      while (written < segment.body.length) {
        const result = await handle.write(segment.body, written,
          segment.body.length - written, offset + written);
        if (result.bytesWritten < 1) throw new Error('attachment_resource_write_incomplete');
        written += result.bytesWritten;
      }
      await handle.sync();
      await args.checkpoint.save(total, offset + segment.body.length);
      offset += segment.body.length;
    }
  } finally { await handle.close(); }
  if (await hashResourceFile(partial) !== args.contentHash) {
    await fs.rm(partial, { force: true });
    await args.checkpoint.clear();
    throw new Error('attachment_checksum_mismatch');
  }
  await fs.rename(partial, args.filePath);
  await args.checkpoint.clear();
}

async function hasVerifiedAttachment(args: {
  filePath: string; contentHash: string; expectedBytes?: number;
}) {
  try {
    const file = await fs.stat(args.filePath);
    if (!file.isFile() || args.expectedBytes !== undefined && file.size !== args.expectedBytes) {
      return false;
    }
    return await hashResourceFile(args.filePath) === args.contentHash;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function verifiedPrefix(handle: fs.FileHandle, first: Buffer, total: number, confirmed: number) {
  const size = (await handle.stat()).size;
  const available = Math.min(size, total, confirmed);
  const complete = available === total ? total
    : Math.floor(available / ATTACHMENT_RANGE_BYTES) * ATTACHMENT_RANGE_BYTES;
  if (size !== complete) {
    await handle.truncate(complete);
    await handle.sync();
  }
  if (complete === 0) return 0;
  const current = Buffer.alloc(first.length);
  const { bytesRead } = await handle.read(current, 0, first.length, 0);
  if (bytesRead === first.length && current.equals(first)) return complete;
  await handle.truncate(0);
  await handle.sync();
  return 0;
}
