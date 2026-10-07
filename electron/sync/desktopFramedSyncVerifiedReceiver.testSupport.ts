import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { loadDesktopFramedSyncBlobSources } from './desktopFramedSyncBlobSources.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { newTransferAttempt } from './desktopFramedSyncProcessWire.js';
import { encodeFramedSyncStream, readFramedSyncStream } from './desktopFramedSyncStream.js';
import { writeDesktopFramedSyncTransferFrames } from './desktopFramedSyncTransferFrameWriter.js';

async function createReceiverFile(filename: string) {
  const host = textDevice();
  try {
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
      await migrateFramedSyncAvailableBlobs(tx, 'desktop');
    });
    host.sqlite.exec('DROP TABLE content_blob_data');
    await host.sqlite.backup(filename);
  } finally { host.sqlite.close(); }
}

function openReceiver(filename: string) {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  const db = createBetterSqliteDbPort(sqlite);
  return { sqlite, db, staging: createDesktopFramedSyncStaging(db, 'chunked') };
}

export async function verifiedReceiverFixture(text: string) {
  const sender = textDevice();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-verified-receiver-'));
  const filename = path.join(directory, 'receiver.sqlite');
  await createReceiverFile(filename);
  let receiver = openReceiver(filename);
  const record = textBranch('verified-stream-version', text, undefined, '2026-10-07T00:00:00.000Z');
  await sender.receive([record]);
  const { manifest } = projectFramedSyncNodeRecord(record);
  const context = { groupId: 'group', protocolVersion: 22 as const, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const contentId = await canonicalContentId(manifest);
  const published = { context, contentId, manifestHash: contentId, transferId: await canonicalTransferId(context, contentId),
    factCount: BigInt(manifest.facts.length), blobCount: BigInt(manifest.blobs.length),
    totalBlobBytes: manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n) };
  const staging = createDesktopFramedSyncStaging(sender.db);
  const publication = { ...published, manifest };
  const groupKey = new Uint8Array(32).fill(19);
  await staging.publishOutbound(publication);
  const attempt = newTransferAttempt(published.transferId);
  await staging.persistOutboundAttempt(published.transferId, attempt);
  await writeDesktopFramedSyncTransferFrames({ attempt, groupKey, manifest, published,
    sources: loadDesktopFramedSyncBlobSources([record], manifest), staging });
  await staging.finalizeOutboundAttempt(published.transferId, attempt.attemptId);
  return { record, published, context, groupKey, get receiver() { return receiver; },
    reopen() { receiver.sqlite.close(); receiver = openReceiver(filename); },
    close() { sender.sqlite.close(); receiver.sqlite.close(); fs.rmSync(directory, { recursive: true, force: true }); },
    async stream(tamper = false) {
      const body = await loadDesktopFramedSyncPreparedTransferBody({ attempt, publication, staging });
      async function* frames() {
        let first = true;
        for await (const frame of body.frames) {
          const ciphertext = new Uint8Array(frame.ciphertext);
          if (tamper && first) ciphertext[0] = ciphertext[0]! ^ 1;
          first = false;
          yield { ...frame, ciphertext };
        }
      }
      return readFramedSyncStream(encodeFramedSyncStream({ preamble: body.preamble, frames: frames() }));
    }
  };
}

export function receiverBusinessRows(fixture: Awaited<ReturnType<typeof verifiedReceiverFixture>>) {
  return ['nodes', 'node_sync_versions', 'sync_object_state', 'content_bodies', 'content_body_chunks', 'content_blobs',
    'node_sync_version_parents', 'node_version_local_proof_state', 'node_version_local_source_revisions',
    'node_version_device_revisions', 'framed_sync_inventory', 'framed_sync_version_summary',
    'framed_sync_fact_summary', 'framed_sync_resource_availability', 'framed_sync_receipts'].map((table) =>
    fixture.receiver.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
