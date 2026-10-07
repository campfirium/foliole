import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';

async function readyFixture(factCount: number) {
  const host = textDevice();
  const data = new TextEncoder().encode('\ufeff中😀\0文'.repeat(350000));
  const descriptor = { sha256: sha256(data), byteLength: BigInt(data.length), role: 1, required: true };
  const fact = { blobs: [descriptor], body: [], factId: 'body-fact', globalId: 'node',
    kind: 1, objectType: 'node', sharedStateHash: descriptor.sha256 };
  const facts = Array.from({ length: factCount }, (_, index) => ({ ...fact,
    factId: index === 0 ? fact.factId : `body-fact-${index}` }));
  const manifest = { blobs: [descriptor], facts };
  const context = { groupId: 'group', protocolVersion: 22 as const, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const contentId = await canonicalContentId(manifest);
  const published = { contentId, context, manifestHash: contentId, transferId: await canonicalTransferId(context, contentId) };
  const staging = createDesktopFramedSyncStaging(host.db);
  const proposal = { ...published, factCount: BigInt(factCount), blobCount: 1n, totalBlobBytes: descriptor.byteLength };
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const attemptId = new Uint8Array(16).fill(7);
  await staging.commitInboundHeaderDeclaration({ attemptId, blobs: [descriptor], facts: facts.map((item) => ({ factId: item.factId,
    globalId: item.globalId, kind: item.kind, objectType: item.objectType,
    requiredBlobHashes: [descriptor.sha256], sharedStateHash: item.sharedStateHash })), proposal,
  published: proposal, reservationId });
  for (const [index, item] of facts.entries()) await stageDesktopFramedSyncFact({ fact: item, staging, frame: { attemptId, transferId: published.transferId,
    authenticatedPlaintext: encodeValidatedProtocolMessage('fact', factToWire(item)),
    ciphertext: Uint8Array.of(1, 2), frameHeader: new Uint8Array(16), frameType: 3,
    preamble: new Uint8Array(96), sequence: BigInt(index) } });
  await staging.commitBlobOfferAndMissingSet({ blobs: [descriptor], transferId: published.transferId });
  for (let offset = 0; offset < data.length; offset += 512 * 1024) {
    await staging.writeBlobChunk({ attemptId, transferId: published.transferId, sha256: descriptor.sha256,
      offset: BigInt(offset), data: data.slice(offset, offset + 512 * 1024) });
  }
  await staging.finalizeInboundAttempt({ attemptId, blobCount: 1n, factCount: BigInt(factCount),
    manifestHash: contentId, transferId: published.transferId });
  await staging.verifyAndMarkBlobAvailable(published.transferId, attemptId, descriptor.sha256);
  await staging.markReadyToApply(published.transferId);
  return { ...host, descriptor, published, fact, facts };
}

export async function reopenedReadyFixture(factCount = 1) {
  const host = await readyFixture(factCount);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ready-facts-'));
  const filename = path.join(directory, 'ready.sqlite');
  await host.sqlite.backup(filename);
  host.sqlite.close();
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: createBetterSqliteDbPort(sqlite), published: host.published, descriptor: host.descriptor, fact: host.fact, facts: host.facts,
    close() { sqlite.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
