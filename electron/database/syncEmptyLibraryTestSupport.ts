import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { applyCompanionContentPack } from '../../lib/core/sync/companionBatchDataPlane.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { loadSyncPackReceiveProgress } from '../../lib/core/sync/syncPackReceiveProgress.js';

import { root, type Peer } from './syncLibrary.testSupport.js';
import { receiveMemberPosition } from './syncMemberPosition.testSupport.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import { readStoredZipEntries } from './syncPackZipReaderTestSupport.js';

export * from './syncLibrary.testSupport.js';

let sequence = 0;

export async function buildPack(source: Peer, target: Peer) {
  const packId = `pack-${++sequence}`;
  const outputPath = path.join(root, `${packId}.zip`);
  const fromStateSeq = (await loadSyncPackReceiveProgress(target.port, source.id)).progress?.cursorStateSeq ?? 0;
  const built = await buildDesktopSyncPackFromDriver({ fromPeerId: source.id, toPeerId: target.id,
    fromStateSeq, packId, outputPath, requireDeliveryHold: true }, source.driver);
  const incoming = path.join(root, `${packId}.db`);
  await writeFile(incoming, inflateSync(readStoredZipEntries(outputPath).get('incoming.db.deflate')!));
  return { ...built, incoming };
}

export async function receivePack(source: Peer, target: Peer, pack: Awaited<ReturnType<typeof buildPack>>) {
  target.db.prepare('ATTACH DATABASE ? AS inc').run(pack.incoming);
  try {
    const result = await applySyncPackNodeSurfaceWithDbPort(target.port, { currentCursor: 0,
      hostName: target.id, sourcePeerId: source.id, recordVersionReceipt: true, enqueueSearchInvalidations: false });
    await receiveBodies(source, target);
    await receiveMemberPosition(target, source);
    return result;
  } finally { target.db.exec('DETACH DATABASE inc'); }
}

export async function sync(source: Peer, target: Peer) {
  const pack = await buildPack(source, target);
  await receivePack(source, target, pack);
  const receipt = (await loadPendingNodeVersionReceipts(target.port, source.id))
    .find((item) => item.packId === pack.packId)!;
  expect(receipt.results.every((result) => result.result === 'applied')).toBe(true);
  await confirmOutboundNodeVersionPack(source.port, { ...receipt, confirmedAt: '2026-09-30T01:00:00Z' });
  await receiveMemberPosition(source, target);
  await collectNodeVersionPayloads(source.port, 'topic');
  return pack;
}

export async function receiveBodies(source: Peer, target: Peer) {
  const needed = target.db.prepare(`SELECT hash FROM content_blobs
    WHERE hash NOT IN (SELECT hash FROM content_blob_data)`).pluck().all() as string[];
  if (!needed.length) return;
  const file = path.join(root, `bodies-${++sequence}.db`);
  const staged = new Database(file);
  try {
    staged.exec('CREATE TABLE content_blob_batch (hash TEXT PRIMARY KEY, size_bytes INTEGER, data BLOB)');
    for (const hash of needed) {
      const bytes = source.db.prepare('SELECT data FROM content_blob_data WHERE hash = ?').pluck().get(hash) as Buffer;
      if (!bytes) continue;
      staged.prepare('INSERT INTO content_blob_batch VALUES (?, ?, ?)').run(hash, bytes.length, bytes);
    }
  } finally { staged.close(); }
  expect((await applyCompanionContentPack(target.port, { failedHashes: [], now: 'now', packPath: file })).failedHashes)
    .toEqual([]);
}
