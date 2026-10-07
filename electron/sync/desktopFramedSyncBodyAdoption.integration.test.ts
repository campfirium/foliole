// @vitest-environment node
import { expect, it } from 'vitest';

import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { adoptFramedSyncAvailableBody, type FramedSyncAvailableBodySource } from '../../lib/core/sync/framedSyncBodyAdoption.js';
import { readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { observeReads } from '../database/syncNodeVerifiedTopicConflict.testSupport.js';

import { adoptDesktopStagedBody } from './desktopFramedSyncBodyAdoption.js';
import { desktopBodyFixture } from './desktopFramedSyncBodyAdoption.testSupport.js';

const now = '2026-10-07T00:00:00.000Z';

it.each([1, 5])('adopts role %s raw Unicode with bounded reads, replay and post-cleanup readability', async (role) => {
  const text = `---\nkey: value\n---\n\ufeff${'中😀\0'.repeat(450000)}tail`;
  const host = await desktopBodyFixture(text, role);
  try {
    const reads = observeReads(host.db);
    const ref = await host.db.transaction(() => adoptDesktopStagedBody(reads.port, host.published, host.descriptor, now));
    expect(ref.byteLength).toBeGreaterThan(3 * 1024 * 1024);
    expect(ref.utf16Length).toBe(text.length);
    expect(ref.frontmatterEnd).toBe(19);
    expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
    expect(await host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now))).toEqual(ref);
    await host.staging.commitApplyAndReceipt({ appliedStateHash: host.published.contentId, contentId: host.published.contentId,
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch', transferId: host.published.transferId });
    await host.staging.releasePins(host.published.transferId, 'business_reference_committed');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
    expect(await readBodyText(host.db, ref)).toBe(text);
  } finally { host.sqlite.close(); }
});

it('adopts empty raw bodies without stable chunks', async () => {
  const host = await desktopBodyFixture('');
  try {
    const ref = await host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now));
    expect(ref.byteLength).toBe(0);
    expect(await readBodyText(host.db, ref)).toBe('');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_body_chunks').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it('retains ready bytes after business rollback and permits retry', async () => {
  const host = await desktopBodyFixture('Original');
  try {
    await expect(host.db.transaction(async (tx) => {
      await adoptDesktopStagedBody(tx, host.published, host.descriptor, now);
      throw new Error('business_failure');
    })).rejects.toThrow('business_failure');
    for (const table of ['content_bodies', 'content_body_chunks', 'content_blobs']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get()).toEqual(Buffer.from(host.data));
    const ref = await host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now));
    expect(await readBodyText(host.db, ref)).toBe('Original');
  } finally { host.sqlite.close(); }
});

it('rejects corrupt raw bytes, conflicting stable chunks and arbitrary sources', async () => {
  const host = await desktopBodyFixture('Original');
  try {
    host.sqlite.prepare('UPDATE framed_sync_available_blobs SET data = ?').run(Buffer.from('Corrupt!'));
    await expect(host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now)))
      .rejects.toThrow('body_hash_mismatch');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies').pluck().get()).toBe(0);
    const hash = Buffer.from(host.descriptor.sha256).toString('hex');
    host.sqlite.prepare('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, 8, 0)').run(hash);
    host.sqlite.prepare('INSERT INTO content_body_chunks VALUES (?, 0, ?)').run(hash, Buffer.from('Original'));
    await expect(host.db.transaction((tx) => adoptDesktopStagedBody(tx, host.published, host.descriptor, now)))
      .rejects.toThrow('body_chunk_identity_conflict');
    await expect(adoptFramedSyncAvailableBody(host.db, 'nodes' as FramedSyncAvailableBodySource, { hash, byteLength: 8 }, now))
      .rejects.toThrow('framed_sync_body_source_invalid');
  } finally { host.sqlite.close(); }
});

it.each([
  ['state', 'framed_sync_transfer_not_ready'],
  ['context', 'framed_sync_transfer_context_mismatch'],
  ['protocol', 'framed_sync_transfer_context_mismatch'],
  ['manifest', 'framed_sync_body_header_mismatch'],
  ['descriptor', 'framed_sync_body_header_mismatch'],
  ['pin', 'framed_sync_body_pin_mismatch'],
  ['available_header', 'framed_sync_body_pin_mismatch'],
  ['raw_length', 'framed_sync_body_pin_mismatch'],
  ['raw_type', 'framed_sync_body_pin_mismatch'],
  ['role', 'framed_sync_body_descriptor_invalid']
])('rejects %s mismatch before stable storage writes', async (kind, error) => {
  const host = await desktopBodyFixture('Original');
  try {
    const published = { ...host.published };
    let descriptor = host.descriptor;
    if (kind === 'state') host.sqlite.exec("UPDATE framed_sync_inbound_transfers SET state = 'receiving'");
    if (kind === 'context') published.context = { ...published.context, groupId: 'other' };
    if (kind === 'protocol') host.sqlite.exec('UPDATE framed_sync_inbound_transfers SET protocol_version = 21');
    if (kind === 'manifest') published.manifestHash = new Uint8Array(32).fill(9);
    if (kind === 'descriptor') descriptor = { ...descriptor, required: false };
    if (kind === 'role') descriptor = { ...descriptor, role: 2 };
    if (kind === 'pin') host.sqlite.exec('UPDATE framed_sync_blob_pins SET required = 0');
    if (kind === 'available_header') host.sqlite.exec('UPDATE framed_sync_available_blobs SET byte_length = 9');
    if (kind === 'raw_length') host.sqlite.exec("UPDATE framed_sync_available_blobs SET data = X'00'");
    if (kind === 'raw_type') host.sqlite.exec("UPDATE framed_sync_available_blobs SET data = 'Original'");
    await expect(host.db.transaction((tx) => adoptDesktopStagedBody(tx, published, descriptor, now))).rejects.toThrow(error);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blobs').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
