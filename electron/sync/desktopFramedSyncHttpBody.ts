import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

const READ_BYTES = 64 * 1024;

/** A request-owned file is authenticated before any frame is decoded or durably staged. */
export async function withVerifiedFramedHttpBody<T>(input: {
  body: AsyncIterable<Uint8Array>;
  expectedSha256: string;
  contentLength?: string;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
}, consume: (stream: AsyncIterable<Uint8Array> & Readonly<{ path: string }>) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{64}$/u.test(input.expectedSha256)) throw new Error('invalid_signature');
  const expectedLength = parseLength(input.contentLength);
  const root = await mkdtemp(join(tmpdir(), 'foliole-framed-http-'));
  const path = join(root, 'request.body');
  let stream: ReturnType<typeof readFramedSyncFileChunks> | undefined;
  try {
    await spool(leaseFramedSyncPayloads(input.body, input.payloadBudget, 'inbound'), path, input.expectedSha256, expectedLength);
    stream = readFramedSyncFileChunks(path);
    return await consume(Object.assign(stream, { path }));
  } finally {
    await stream?.return(undefined);
    await rm(root, { recursive: true, force: true });
  }
}

function parseLength(value?: string) {
  if (value === undefined) return null;
  const length = Number(value);
  if (!/^[0-9]+$/u.test(value) || !Number.isSafeInteger(length)) throw new Error('invalid_http_body_length');
  return length;
}

async function spool(body: AsyncIterable<Uint8Array>, path: string, expected: string, expectedLength: number | null) {
  const file = await open(path, 'wx');
  const digest = createHash('sha256');
  let length = 0;
  try {
    for await (const chunk of body) {
      length += chunk.byteLength;
      if (!Number.isSafeInteger(length) || (expectedLength !== null && length > expectedLength)) {
        throw new Error('http_body_length_exceeded');
      }
      for (let offset = 0; offset < chunk.byteLength; offset += READ_BYTES) {
        const bytes = chunk.subarray(offset, offset + READ_BYTES);
        await writeAll(file, bytes);
        digest.update(bytes);
      }
    }
    if (expectedLength !== null && length !== expectedLength) throw new Error('truncated_http_body');
    if (!timingSafeEqual(digest.digest(), Buffer.from(expected, 'hex'))) throw new Error('invalid_signature');
  } finally { await file.close(); }
}

async function writeAll(file: Awaited<ReturnType<typeof open>>, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await file.write(bytes, offset, bytes.byteLength - offset);
    if (bytesWritten < 1) throw new Error('http_body_write_failed');
    offset += bytesWritten;
  }
}
