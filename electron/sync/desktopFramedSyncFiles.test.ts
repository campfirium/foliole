// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { createFramedSyncFileAttempts } from '../../lib/core/sync/framedSyncFileAttempts.js';
import { loadFramedSyncFilePublication, publishFramedSyncFileOutbound,
  streamFramedSyncFilePublications } from '../../lib/core/sync/framedSyncFilePublication.js';
import { encodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';

import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { newTransferAttempt } from './desktopFramedSyncProcessWire.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(receiverDeviceId = 'receiver') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-transport-files-'));
  roots.push(root);
  const files = createDesktopFramedSyncFiles(root);
  const context = { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION as typeof FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', receiverDeviceId,
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const manifest = { blobs: [], facts: [{ kind: 2, factId: 'version', objectType: 'node', globalId: 'node',
    sharedStateHash: new Uint8Array(32).fill(1), blobs: [], body: [] }] };
  const contentId = await canonicalContentId(manifest);
  const publication = { context, manifest, contentId, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId) };
  return { files, root, publication };
}

it('keeps a sealed publication in library files across reopening without a database', async () => {
  const { files, root, publication } = await fixture();
  expect(await publishFramedSyncFileOutbound(files, publication)).toBe('created');
  const reopened = createDesktopFramedSyncFiles(root);
  expect(await loadFramedSyncFilePublication(reopened, publication.transferId)).toEqual(publication);
  const publications = [];
  for await (const item of streamFramedSyncFilePublications(reopened)) publications.push(item);
  expect(publications).toEqual([publication]);
  const id = Buffer.from(publication.transferId).toString('hex');
  expect(JSON.parse(await readFile(path.join(root, 'outbound', id, 'publication.json'), 'utf8')))
    .toEqual(expect.objectContaining({ context: publication.context }));
  const anotherLibrary = await fixture();
  expect(await loadFramedSyncFilePublication(anotherLibrary.files, publication.transferId)).toBeNull();
});

it('serializes competing publication writers and rejects a corrupt frozen input', async () => {
  const { files, root, publication } = await fixture();
  expect((await Promise.all([files, createDesktopFramedSyncFiles(root)].map((port) =>
    publishFramedSyncFileOutbound(port, publication)))).sort()).toEqual(['created', 'identical']);
  const id = Buffer.from(publication.transferId).toString('hex');
  const file = path.join(root, 'outbound', id, 'publication.json');
  const stored = JSON.parse(await readFile(file, 'utf8'));
  stored.context.receiverDeviceId = 'different-receiver';
  await writeFile(file, JSON.stringify(stored));
  await expect(loadFramedSyncFilePublication(files, publication.transferId)).rejects.toThrow('outbound_transfer_identity_mismatch');
});

function frame(sequence: bigint, byte = 1) {
  const ciphertext = new Uint8Array(32).fill(byte);
  return { sequence, frameType: 3, ciphertext,
    frameHeader: encodeFrameHeader({ sequence, frameType: 3, ciphertextBytes: ciphertext.length, flags: 0 }) };
}

it('reopens only fully sealed attempts and streams their exact persisted bytes', async () => {
  const { files, root, publication } = await fixture();
  const attempts = createFramedSyncFileAttempts(files, 'transfer');
  const attempt = newTransferAttempt(publication.transferId);
  await attempts.persist(publication.transferId, attempt);
  await attempts.commit(publication.transferId, attempt.attemptId, frame(0n));
  const reopened = createFramedSyncFileAttempts(createDesktopFramedSyncFiles(root), 'transfer');
  expect(await reopened.listReplayable(publication.transferId)).toEqual([]);
  await reopened.commit(publication.transferId, attempt.attemptId, frame(1n, 2));
  await reopened.finalize(publication.transferId, attempt.attemptId);
  expect(await reopened.listReplayable(publication.transferId)).toEqual([expect.objectContaining(attempt)]);
  const frames = [];
  for await (const value of reopened.stream(publication.transferId, attempt.attemptId)) frames.push(value);
  expect(frames).toEqual([frame(0n), frame(1n, 2)]);
});

it('rejects a changed frame under the same nonce and does not publish a sequence gap', async () => {
  const { files, publication } = await fixture();
  const attempts = createFramedSyncFileAttempts(files, 'transfer');
  const attempt = newTransferAttempt(publication.transferId);
  await attempts.persist(publication.transferId, attempt);
  await attempts.commit(publication.transferId, attempt.attemptId, frame(0n));
  await expect(attempts.commit(publication.transferId, attempt.attemptId, frame(0n, 2)))
    .rejects.toThrow('outbound_frame_identity_conflict');
  await attempts.commit(publication.transferId, attempt.attemptId, frame(2n));
  await expect(attempts.finalize(publication.transferId, attempt.attemptId)).rejects.toThrow('outbound_frame_sequence_gap');
  await attempts.abandon(publication.transferId, attempt.attemptId);
  await expect(attempts.commit(publication.transferId, attempt.attemptId, frame(0n)))
    .rejects.toThrow('outbound_attempt_not_prepared');
  expect(await attempts.listReplayable(publication.transferId)).toEqual([]);
});

it('keeps incomplete writes out of enumeration and refuses paths outside the transport root', async () => {
  const { files } = await fixture();
  await files.write(`outbound/${'a'.repeat(64)}/unsealed.json`, new TextEncoder().encode('{}'));
  const publications = [];
  for await (const value of streamFramedSyncFilePublications(files)) publications.push(value);
  expect(publications).toEqual([]);
  await expect(files.read('../foliole.db')).rejects.toThrow('framed_sync_file_key_invalid');
});
