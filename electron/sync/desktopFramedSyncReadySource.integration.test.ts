// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';

import { loadLegacyDesktopFramedSyncReadyFacts } from './desktopFramedSyncLegacyReadyFacts.testSupport.js';
import { reopenedReadyFixture } from './desktopFramedSyncReadyFacts.testSupport.js';
import { loadDesktopFramedSyncReadySource, loadDesktopFramedSyncReadySourceFact,
  streamDesktopFramedSyncReadySourceFacts } from './desktopFramedSyncReadySource.js';

function observedReadyReads(db: DbPort) {
  const frames: DbParams[] = [];
  const port: DbPort = { ...db, async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    expect(sql).not.toMatch(/content_body_chunks|content_blob_data/u);
    const rows = await db.query<T>(sql, params);
    for (const row of rows) for (const value of Object.values(row)) {
      if (value instanceof Uint8Array) expect(value.byteLength).toBeLessThan(4096);
      if (typeof value === 'string') expect(Buffer.byteLength(value)).toBeLessThan(768 * 1024);
    }
    if (/FROM framed_sync_inbound_frames/u.test(sql)) {
      expect(sql).toMatch(/LIMIT 1/u);
      expect(sql).toMatch(/transfer_id = \? AND attempt_id = \?/u);
      expect(sql).toMatch(/frame_type = \?/u);
      expect(rows.length).toBeLessThanOrEqual(1);
      frames.push(params);
    }
    return rows;
  } };
  return { port, frames };
}

it.each([1, 13])('recovers %i fact locators after real SQLite reopen with the original result', async (count) => {
  const host = await reopenedReadyFixture(count);
  try {
    const old = await loadLegacyDesktopFramedSyncReadyFacts(host.db, host.published);
    const observed = observedReadyReads(host.db);
    const source = await loadDesktopFramedSyncReadySource(observed.port, host.published);
    expect(source).not.toBeNull();
    expect(source).not.toHaveProperty('facts');
    expect(source?.entries).toHaveLength(count);
    expect(source?.entries.map((entry) => entry.sequence)).toEqual(Array.from({ length: count }, (_, index) => String(index)));
    for (const entry of source!.entries) {
      expect(entry).not.toHaveProperty('fact');
      expect(entry.descriptor).not.toHaveProperty('body');
      expect(entry.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    }
    const streamed = [];
    for await (const entry of streamDesktopFramedSyncReadySourceFacts(observed.port, source!)) streamed.push(entry.fact);
    expect(streamed).toEqual(old?.facts);
    expect(source?.blobs).toEqual(old?.blobs);
    expect(source?.context).toEqual(old?.context);
    expect(source?.contentId).toEqual(old?.contentId);
    expect(source?.manifestHash).toEqual(old?.manifestHash);
    expect(source?.transferId).toEqual(old?.transferId);
    expect(source?.globalId).toBe(old?.globalId);
    expect(source?.objectType).toBe(old?.objectType);
    expect(observed.frames.length).toBeGreaterThan(count);
    expect(host.sqlite.prepare('SELECT length(data) FROM framed_sync_available_blobs').pluck().get()).toBe(1048576);
  } finally { host.close(); }
});

it('rolls caller failure back without changing ready ownership and supports a fresh transaction', async () => {
  const host = await reopenedReadyFixture();
  try {
    let expired: DbPort | undefined;
    await expect(host.db.transaction(async (tx) => {
      expired = tx;
      const source = await loadDesktopFramedSyncReadySource(tx, host.published);
      expect(await loadDesktopFramedSyncReadySourceFact(tx, source!, '0')).toEqual(host.fact);
      await tx.run("UPDATE framed_sync_inbound_transfers SET state = 'applied'");
      throw new Error('business_failure');
    })).rejects.toThrow('business_failure');
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
    await expect(loadDesktopFramedSyncReadySource(expired!, host.published)).rejects.toThrow();
    await host.db.transaction(async (tx) => {
      const source = await loadDesktopFramedSyncReadySource(tx, host.published);
      expect(await loadDesktopFramedSyncReadySourceFact(tx, source!, '0')).toEqual(host.fact);
    });
  } finally { host.close(); }
});

it.each([
  ['manifest', 'framed_sync_ready_manifest_mismatch'],
  ['content', 'framed_sync_ready_manifest_mismatch'],
  ['context', 'framed_sync_transfer_context_mismatch'],
  ['protocol', 'framed_sync_transfer_context_mismatch'],
  ['fact_body', 'outbound_manifest_identity_mismatch'],
  ['header_descriptor', 'inbound_manifest_header_mismatch']
] as const)('rejects changed %s with the original error and durable owner', async (kind, error) => {
  const host = await reopenedReadyFixture();
  try {
    const published = { ...host.published };
    if (kind === 'manifest') published.manifestHash = new Uint8Array(32).fill(9);
    if (kind === 'content') published.contentId = new Uint8Array(32).fill(9);
    if (kind === 'context') published.context = { ...published.context, senderLibraryEpoch: 'other' };
    if (kind === 'protocol') host.sqlite.exec('UPDATE framed_sync_inbound_transfers SET protocol_version = 21');
    if (kind === 'fact_body') {
      const changed = { ...host.fact, body: [{ name: 'extra', value: { kind: 'string' as const, value: 'changed' } }] };
      host.sqlite.prepare('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ?')
        .run(encodeValidatedProtocolMessage('fact', factToWire(changed)));
    }
    if (kind === 'header_descriptor') {
      const header = JSON.parse(host.sqlite.prepare('SELECT header_json FROM framed_sync_inbound_transfers').pluck().get() as string);
      header.facts[0].factId = 'other';
      host.sqlite.prepare('UPDATE framed_sync_inbound_transfers SET header_json = ?').run(JSON.stringify(header));
    }
    await expect(loadLegacyDesktopFramedSyncReadyFacts(host.db, published)).rejects.toThrow(error);
    await expect(loadDesktopFramedSyncReadySource(host.db, published)).rejects.toThrow(error);
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it('returns null for a nonready transfer like the original loader', async () => {
  const host = await reopenedReadyFixture();
  try {
    host.sqlite.exec("UPDATE framed_sync_inbound_transfers SET state = 'receiving'");
    expect(await loadDesktopFramedSyncReadySource(host.db, host.published)).toBeNull();
    expect(await loadLegacyDesktopFramedSyncReadyFacts(host.db, host.published)).toBeNull();
  } finally { host.close(); }
});

it('rejects a state body changed after source capture even when its descriptor and declared hash are unchanged', async () => {
  const host = await reopenedReadyFixture();
  try {
    const source = await loadDesktopFramedSyncReadySource(host.db, host.published);
    const changed = { ...host.fact, body: [{ name: 'state', value: { kind: 'string' as const, value: 'changed' } }] };
    host.sqlite.prepare('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE sequence = ?')
      .run(encodeValidatedProtocolMessage('fact', factToWire(changed)), '0');
    const stream = streamDesktopFramedSyncReadySourceFacts(host.db, source!);
    await expect(stream.next()).rejects.toThrow('canonical_fact_source_changed');
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it('early stop does not query or decode the next oversized malformed frame', async () => {
  const host = await reopenedReadyFixture(13);
  try {
    const source = await loadDesktopFramedSyncReadySource(host.db, host.published);
    host.sqlite.prepare('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE sequence = ?')
      .run(Buffer.alloc(3 * 1024 * 1024, 255), '1');
    const observed = observedReadyReads(host.db);
    for await (const entry of streamDesktopFramedSyncReadySourceFacts(observed.port, source!)) {
      expect(entry.sequence).toBe('0');
      expect(entry.fact).toEqual(host.facts[0]);
      break;
    }
    expect(observed.frames).toHaveLength(1);
    expect(observed.frames[0]?.[2]).toBe('0');
    const stream = streamDesktopFramedSyncReadySourceFacts(host.db, source!);
    await stream.next();
    await expect(stream.next()).rejects.toThrow();
  } finally { host.close(); }
});
