// @vitest-environment node
import { expect, it } from 'vitest';

import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { observeReads } from '../database/syncNodeVerifiedTopicConflict.testSupport.js';

import { adoptDesktopStagedBody } from './desktopFramedSyncBodyAdoption.js';
import { desktopBodyFixture } from './desktopFramedSyncBodyAdoption.testSupport.js';

const now = '2026-10-07T00:00:00.000Z';

it.each([1, 5])('adopts migrated ready role %s without continuous bytes and survives rollback and pin retirement', async (role) => {
  const text = '\ufeff中😀\0'.repeat(500000);
  const host = await desktopBodyFixture(text, role);
  try {
    await host.db.transaction((tx) => migrateFramedSyncAvailableBlobs(tx, 'desktop'));
    const reads = observeReads(host.db);
    await expect(host.db.transaction(async () => {
      await adoptDesktopStagedBody(reads.port, host.published, host.descriptor, now, 'chunked');
      throw new Error('business_failure');
    })).rejects.toThrow('business_failure');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    const ref = await host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now, 'chunked'));
    expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
    await host.staging.commitApplyAndReceipt({ appliedStateHash: host.published.contentId, contentId: host.published.contentId,
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch', transferId: host.published.transferId });
    await host.staging.releasePins(host.published.transferId, 'business_reference_committed');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blob_chunks').pluck().get()).toBe(0);
    expect(await readBodyText(host.db, ref)).toBe(text);
  } finally { host.sqlite.close(); }
});

it.each(['missing', 'corrupt'])('rejects %s ready chunks before creating a business owner', async (kind) => {
  const host = await desktopBodyFixture('Original');
  try {
    await host.db.transaction((tx) => migrateFramedSyncAvailableBlobs(tx, 'desktop'));
    if (kind === 'missing') host.sqlite.exec('DELETE FROM framed_sync_available_blob_chunks');
    else host.sqlite.prepare('UPDATE framed_sync_available_blob_chunks SET data = ?').run(Buffer.from('Corrupt!'));
    await expect(host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now, 'chunked')))
      .rejects.toThrow(kind === 'missing' ? 'blob_coverage_incomplete' : 'blob_hash_mismatch');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.sqlite.close(); }
});

it('runs receive, durable verification, ready retirement and business adoption using chunked staging', async () => {
  const text = '中😀\0'.repeat(450000);
  const host = await desktopBodyFixture(text, 5, 'chunked');
  try {
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_chunks').pluck().get()).toBe(0);
    const ref = await host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now, 'chunked'));
    expect(await readBodyText(host.db, ref)).toBe(text);
    expect(host.sqlite.prepare('PRAGMA table_info(framed_sync_available_blobs)').all()).not.toContainEqual(expect.objectContaining({ name: 'data' }));
  } finally { host.sqlite.close(); }
});
