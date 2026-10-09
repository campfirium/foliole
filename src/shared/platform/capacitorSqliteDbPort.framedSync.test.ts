import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../lib/core/database/framedSyncStagingSchema';
import { canonicalContentId, canonicalTransferId, type CanonicalManifest } from '../../../lib/core/sync/framedSyncCanonicalManifest';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../lib/core/sync/framedSyncContract';
import { createFramedSyncOutboundStaging } from '../../../lib/core/sync/framedSyncOutboundStaging';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

it.each(['ios', 'android'])('persists empty and body-bearing outbound publications through the %s JSON bridge', async (platform) => {
  const database = new Database(':memory:');
  try {
    database.exec(FRAMED_SYNC_STAGING_SCHEMA.join(';\n'));
    const native = createFakeCapacitorConnection(database);
    const connection = {
      ...native,
      run: (sql: string, params: unknown[]) => native.run(sql, JSON.parse(JSON.stringify(params))),
      query: (sql: string, params: unknown[]) => native.query(sql, JSON.parse(JSON.stringify(params)))
    };
    const staging = createFramedSyncOutboundStaging(createCapacitorSqliteDbPort(connection as never, platform));
    for (const byteLength of [0n, 1048533n]) {
      const publication = await createPublication(byteLength);
      await expect(staging.publishOutbound(publication)).resolves.toBe('created');
      await expect(staging.publishOutbound(publication)).resolves.toBe('identical');
      const stored = await staging.loadOutboundPublication(publication.transferId);
      expect(stored).toEqual(publication);
    }
    expect(database.prepare(`SELECT total_blob_bytes AS bytes, typeof(total_blob_bytes) AS type
      FROM framed_sync_outbound_publications ORDER BY total_blob_bytes`).all()).toEqual([
      { bytes: 0, type: 'integer' }, { bytes: 1048533, type: 'integer' }
    ]);
    expect(database.prepare(`SELECT byte_length AS bytes, typeof(byte_length) AS type
      FROM framed_sync_outbound_blob_refs`).all()).toEqual([{ bytes: 1048533, type: 'integer' }]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 2 });
  } finally {
    database.close();
  }
});

async function createPublication(byteLength: bigint) {
  const blobs = byteLength ? [{ byteLength, required: true, role: 1, sha256: new Uint8Array(32).fill(7) }] : [];
  const manifest: CanonicalManifest = {
    blobs,
    facts: [{ blobs, body: [], factId: `version-${byteLength}`, globalId: 'node-a', kind: 2,
      objectType: 'node', sharedStateHash: new Uint8Array(32).fill(1) }]
  };
  const context: FramedSyncContext = {
    groupId: 'group-a', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: 'mac', receiverLibraryEpoch: 'mac-epoch',
    senderDeviceId: 'phone', senderLibraryEpoch: 'phone-epoch'
  };
  const contentId = await canonicalContentId(manifest);
  return { contentId, context, manifest, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId) };
}
