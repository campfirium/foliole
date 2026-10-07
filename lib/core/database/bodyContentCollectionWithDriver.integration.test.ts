// @vitest-environment node
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { observeDriver } from '../../../electron/database/bodyContentDriver.testSupport.js';
import { createDesktopFramedSyncStaging } from '../../../electron/database/desktopFramedSyncStaging.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { adoptVerifiedBody, stageTextBodyContent } from '../sync/bodyContentWrite.js';
import { canonicalContentId, canonicalTransferId } from '../sync/framedSyncCanonicalManifest.js';
import { readBodyText } from '../sync/verifiedBody.js';

import { collectBodyContentCandidates } from './bodyContentCollection.js';
import { collectBodyContentCandidatesWithDriver } from './bodyContentCollectionWithDriver.js';
import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { migrateBodyContentOwners } from './bodyContentOwnerMigration.js';
import { bodyJsonHolderContainsBodyWithDriver } from './bodyHolderScalarHashWithDriver.js';

async function fixture(body: string) {
  const host = textDevice();
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
  const ref = await stageTextBodyContent(host.db, body);
  await adoptVerifiedBody(host.db, ref, '');
  const reads = observeDriver(createBetterSqlite3Driver(host.sqlite));
  return { ...host, ref, reads };
}

it.each(['port', 'driver'] as const)('protects readable scalar ownership and releases it with bounded %s reads', async (mode) => {
  const body = '\ufeff中😀\0文'.repeat(300000);
  const host = await fixture(body);
  try {
    const insert = host.sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, snapshot_json, body_state)
      VALUES (?, 'node', 'host', '', 'fact', ?, ?)`);
    for (const state of ['retired', 'unavailable', 'readable']) insert.run(state, JSON.stringify({ nested: { source: body } }), state);
    const collect = () => mode === 'driver' ? collectBodyContentCandidatesWithDriver(host.reads.driver, [host.ref.hash])
      : collectBodyContentCandidates(host.db, [host.ref.hash]);
    expect((await collect()).deletedHashes).toEqual([]);
    expect(await readBodyText(host.db, host.ref)).toBe(body);
    host.sqlite.prepare("DELETE FROM node_sync_versions WHERE body_state = 'readable'").run();
    expect(await collect()).toEqual({ deletedHashes: [host.ref.hash], deletedBytes: host.ref.byteLength });
    if (mode === 'driver') expect(host.reads.sizes.length).toBeGreaterThan(12);
    expect(Math.max(0, ...host.reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  } finally { host.sqlite.close(); }
});

it.each(['', '\ufeff中😀\0文'.repeat(300000)])('hashes nested object keys without reading a complete scalar', async (body) => {
  const host = await fixture(body);
  try {
    host.sqlite.prepare(`INSERT INTO nodes (id, title, image_sources, created_at, updated_at)
      VALUES ('holder', 'Holder', ?, '', '')`).run(JSON.stringify({ nested: { [body]: false } }));
    const holder = { table: 'nodes', column: 'image_sources' } as const;
    expect(host.reads.driver.transaction((tx) => bodyJsonHolderContainsBodyWithDriver(tx, holder, host.ref))).toBe(true);
    expect(() => bodyJsonHolderContainsBodyWithDriver(host.reads.driver, holder, host.ref, { readableVersionsOnly: true }))
      .toThrow('body_holder_filter_invalid');
    host.sqlite.prepare('DELETE FROM nodes WHERE id = ?').run('holder');
    expect(bodyJsonHolderContainsBodyWithDriver(host.reads.driver, holder, host.ref)).toBe(false);
    expect(Math.max(0, ...host.reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  } finally { host.sqlite.close(); }
});

it('rolls back earlier deletions after a second candidate rejects', async () => {
  const host = await fixture('first');
  try {
    const second = await stageTextBodyContent(host.db, 'second');
    await adoptVerifiedBody(host.db, second, '');
    host.sqlite.exec(`CREATE TRIGGER reject_second BEFORE DELETE ON content_bodies
      WHEN OLD.hash = '${second.hash}' BEGIN SELECT RAISE(ABORT, 'second_rejected'); END`);
    expect(() => collectBodyContentCandidatesWithDriver(host.reads.driver, [host.ref.hash, second.hash]))
      .toThrow('second_rejected');
    expect(await readBodyText(host.db, host.ref)).toBe('first');
    expect(await readBodyText(host.db, second)).toBe('second');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blobs WHERE hash IN (?, ?)').pluck().get(host.ref.hash, second.hash)).toBe(2);
  } finally { host.sqlite.close(); }
});

it('rejects malformed holder JSON without losing original chunks', async () => {
  const host = await fixture('original');
  try {
    host.sqlite.prepare(`INSERT INTO nodes (id, title, image_sources, created_at, updated_at)
      VALUES ('holder', 'Holder', '{bad json', '', '')`).run();
    expect(() => collectBodyContentCandidatesWithDriver(host.reads.driver, [host.ref.hash])).toThrow('malformed JSON');
    expect(await readBodyText(host.db, host.ref)).toBe('original');
  } finally { host.sqlite.close(); }
});

async function publication(host: Awaited<ReturnType<typeof fixture>>, role: number) {
  const blob = { byteLength: BigInt(host.ref.byteLength), required: true, role,
    sha256: new Uint8Array(Buffer.from(host.ref.hash, 'hex')) };
  const manifest = { blobs: [blob], facts: [{ blobs: [blob], body: [], factId: 'frozen',
    globalId: 'node', kind: 1, objectType: 'node', sharedStateHash: blob.sha256 }] };
  const context = { groupId: 'group', protocolVersion: 22 as const, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const contentId = await canonicalContentId(manifest);
  return { blob, contentId, context, manifest, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId) };
}

it.each([1, 5])('protects native inbound pins and frozen outbound holds for role %s', async (role) => {
  const host = await fixture('frozen original');
  try {
    const value = await publication(host, role);
    const staging = createDesktopFramedSyncStaging(host.db);
    await staging.admitInboundProposal({ ...value, blobCount: 1n, factCount: 1n,
      totalBlobBytes: BigInt(host.ref.byteLength) });
    host.sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)')
      .run(value.blob.sha256, host.ref.byteLength, Buffer.from('frozen original'));
    host.sqlite.prepare('INSERT INTO framed_sync_blob_pins VALUES (?, ?, ?, ?, ?)')
      .run(value.transferId, value.blob.sha256, host.ref.byteLength, role, 1);
    const collect = () => collectBodyContentCandidatesWithDriver(host.reads.driver, [host.ref.hash]);
    expect(collect().deletedHashes).toEqual([]);
    host.sqlite.prepare("UPDATE framed_sync_inbound_transfers SET state = 'applied' WHERE transfer_id = ?")
      .run(value.transferId);
    await staging.publishOutbound(value);
    await staging.releasePins(value.transferId, 'business_reference_committed');
    expect(collect().deletedHashes).toEqual([]);
    await staging.commitOutboundReceipt({ ...value, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'receiver-epoch', appliedStateHash: value.contentId });
    expect(collect().deletedHashes).toEqual([]);
    expect(await readBodyText(host.db, host.ref)).toBe('frozen original');
    await staging.releaseOutboundHolds(value.transferId);
    expect(collect().deletedHashes).toEqual([host.ref.hash]);
  } finally { host.sqlite.close(); }
});
