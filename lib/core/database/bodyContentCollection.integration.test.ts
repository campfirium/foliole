// @vitest-environment node
import { expect, it } from 'vitest';

import { createDesktopFramedSyncStaging } from '../../../electron/database/desktopFramedSyncStaging.js';
import { observeReads } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { adoptVerifiedBody, stageTextBodyContent } from '../sync/bodyContentWrite.js';
import { canonicalContentId, canonicalTransferId } from '../sync/framedSyncCanonicalManifest.js';
import { loadVerifiedBodyRef, readBodyText } from '../sync/verifiedBody.js';

import { collectBodyContentCandidates } from './bodyContentCollection.js';
import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { migrateBodyContentOwners } from './bodyContentOwnerMigration.js';

async function fixture(body = '\ufeff中😀\0文'.repeat(300000)) {
  const host = textDevice();
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
  const ref = await host.db.transaction(async (tx) => {
    const value = await stageTextBodyContent(tx, body);
    await adoptVerifiedBody(tx, value, '2026-10-07T00:00:00.000Z');
    return value;
  });
  return { ...host, ref };
}

it.each(['', '\ufeff中😀\0文'.repeat(300000)])('collects an unowned adopted body with bounded reads', async (body) => {
  const host = await fixture(body);
  try {
    const reads = observeReads(host.db);
    expect(await collectBodyContentCandidates(reads.port, [host.ref.hash, host.ref.hash]))
      .toEqual({ deletedHashes: [host.ref.hash], deletedBytes: host.ref.byteLength });
    expect(await loadVerifiedBodyRef(host.db, host.ref.hash)).toBeNull();
    expect(host.sqlite.prepare('SELECT count(*) FROM content_body_chunks').pluck().get()).toBe(0);
    expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
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

it.each([1, 5])('retains adopted body while native inbound role %s pins it', async (role) => {
  const host = await fixture('Pinned body');
  try {
    const value = await publication(host, role);
    const staging = createDesktopFramedSyncStaging(host.db);
    await staging.admitInboundProposal({ ...value, blobCount: 1n, factCount: 1n,
      totalBlobBytes: BigInt(host.ref.byteLength) });
    host.sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)')
      .run(value.blob.sha256, host.ref.byteLength, Buffer.from('Pinned body'));
    host.sqlite.prepare('INSERT INTO framed_sync_blob_pins VALUES (?, ?, ?, ?, ?)')
      .run(value.transferId, value.blob.sha256, host.ref.byteLength, role, 1);
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([]);
    expect(await readBodyText(host.db, host.ref)).toBe('Pinned body');
    host.sqlite.prepare("UPDATE framed_sync_inbound_transfers SET state = 'applied' WHERE transfer_id = ?")
      .run(value.transferId);
    await staging.releasePins(value.transferId, 'business_reference_committed');
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([host.ref.hash]);
  } finally { host.sqlite.close(); }
});

it.each([1, 5])('retains frozen outbound role %s until its acknowledged hold releases', async (role) => {
  const host = await fixture('Frozen body');
  try {
    const value = await publication(host, role);
    const staging = createDesktopFramedSyncStaging(host.db);
    await staging.publishOutbound(value);
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([]);
    expect(await readBodyText(host.db, host.ref)).toBe('Frozen body');
    await staging.commitOutboundReceipt({ ...value, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'receiver-epoch', appliedStateHash: value.contentId });
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([]);
    await staging.releaseOutboundHolds(value.transferId);
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([host.ref.hash]);
  } finally { host.sqlite.close(); }
});

it.each(['body_hash', 'alternative_hash', 'scalar'] as const)('ignores retired/unavailable %s while preserving readable ownership', async (kind) => {
  const body = '\ufeff中😀\0文'.repeat(300000);
  const host = await fixture(body);
  try {
    const insert = host.sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, snapshot_json, body_state, body_blob_hash)
      VALUES (?, 'node', 'host', '', 'fact', ?, ?, ?)`);
    const snapshot = JSON.stringify(kind === 'body_hash' ? { body_blob_hash: host.ref.hash } :
      kind === 'alternative_hash' ? { text_alternatives: [{ body_blob_hash: host.ref.hash }] } : { source: body });
    insert.run('retired', snapshot, 'retired', host.ref.hash);
    insert.run('unavailable', snapshot, 'unavailable', host.ref.hash);
    insert.run('readable', snapshot, 'readable', null);
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([]);
    expect(await readBodyText(host.db, host.ref)).toBe(body);
    host.sqlite.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run('readable');
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([host.ref.hash]);
  } finally { host.sqlite.close(); }
});

it('rolls back all candidate deletions when the second delete is rejected', async () => {
  const host = await fixture('First original');
  try {
    const second = await host.db.transaction(async (tx) => {
      const ref = await stageTextBodyContent(tx, 'Second original');
      await adoptVerifiedBody(tx, ref, '');
      return ref;
    });
    host.sqlite.exec(`CREATE TRIGGER reject_second_body BEFORE DELETE ON content_bodies
      WHEN OLD.hash = '${second.hash}' BEGIN SELECT RAISE(ABORT, 'second_delete_rejected'); END`);
    await expect(collectBodyContentCandidates(host.db, [host.ref.hash, second.hash]))
      .rejects.toThrow('second_delete_rejected');
    expect(await readBodyText(host.db, host.ref)).toBe('First original');
    expect(await readBodyText(host.db, second)).toBe('Second original');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blobs WHERE hash IN (?, ?)')
      .pluck().get(host.ref.hash, second.hash)).toBe(2);
  } finally { host.sqlite.close(); }
});

it('rejects malformed holder JSON without deleting original chunks or manifest', async () => {
  const host = await fixture('Original');
  try {
    host.sqlite.prepare(`INSERT INTO nodes (id, title, image_sources, created_at, updated_at)
      VALUES ('invalid-holder', 'Invalid', '{bad json', '', '')`).run();
    await expect(collectBodyContentCandidates(host.db, [host.ref.hash])).rejects.toThrow('malformed JSON');
    expect(await readBodyText(host.db, host.ref)).toBe('Original');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blobs WHERE hash = ?').pluck().get(host.ref.hash)).toBe(1);
  } finally { host.sqlite.close(); }
});

it.each(['reference', 'scalar', 'hash_key'] as const)('retains an exact %s holder until it releases ownership', async (kind) => {
  const body = '中😀'.repeat(400000);
  const host = await fixture(body);
  try {
    host.sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash,
      image_sources, created_at, updated_at) VALUES ('holder', 'topic', 'Holder', '', ?, ?, '', '')`)
      .run(kind === 'reference' ? host.ref.hash : null,
        kind === 'scalar' ? JSON.stringify({ source: body }) : kind === 'hash_key' ? JSON.stringify({ [host.ref.hash]: false }) : null);
    expect(await collectBodyContentCandidates(host.db, [host.ref.hash])).toEqual({ deletedHashes: [], deletedBytes: 0 });
    host.sqlite.prepare('DELETE FROM nodes WHERE id = ?').run('holder');
    expect((await collectBodyContentCandidates(host.db, [host.ref.hash])).deletedHashes).toEqual([host.ref.hash]);
  } finally { host.sqlite.close(); }
});

it('does not collect a staged body before an adopted manifest owns it', async () => {
  const host = await fixture('adopted');
  try {
    const staged = await stageTextBodyContent(host.db, 'staged');
    expect(await collectBodyContentCandidates(host.db, [staged.hash])).toEqual({ deletedHashes: [], deletedBytes: 0 });
    expect(await loadVerifiedBodyRef(host.db, staged.hash)).toEqual(staged);
  } finally { host.sqlite.close(); }
});

it('rolls back previously selected deletion if a later candidate has contradictory identity', async () => {
  const host = await fixture('first');
  try {
    const next = await host.db.transaction(async (tx) => {
      const ref = await stageTextBodyContent(tx, 'second');
      await adoptVerifiedBody(tx, ref, '');
      return ref;
    });
    host.sqlite.prepare('UPDATE content_blobs SET original_size_bytes = original_size_bytes + 1 WHERE hash = ?').run(next.hash);
    await expect(collectBodyContentCandidates(host.db, [host.ref.hash, next.hash]))
      .rejects.toThrow('body_manifest_identity_conflict');
    expect(await loadVerifiedBodyRef(host.db, host.ref.hash)).toEqual(host.ref);
    expect(await loadVerifiedBodyRef(host.db, next.hash)).toEqual(next);
  } finally { host.sqlite.close(); }
});
