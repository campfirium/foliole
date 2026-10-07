// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';

import { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';
import { reopenedReadyFixture } from './desktopFramedSyncReadyFacts.testSupport.js';

it('recovers the exact metadata after SQLite restart without reading body bytes', async () => {
  const host = await reopenedReadyFixture();
  try {
    const queries: string[] = [];
    const metadata: DbPort = { ...host.db,
      async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
        queries.push(sql);
        const rows = await host.db.query<T>(sql, params);
        for (const row of rows) for (const value of Object.values(row)) {
          const size = typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.length : 0;
          expect(size).toBeLessThan(4096);
        }
        return rows;
      }
    };
    const ready = await loadDesktopFramedSyncReadyFacts(metadata, host.published);
    expect(ready?.facts).toEqual([host.fact]);
    expect(ready?.blobs).toEqual([host.descriptor]);
    expect(ready?.context).toEqual(host.published.context);
    expect(ready?.globalId).toBe('node');
    expect(queries).toHaveLength(2);
    expect(queries.every((sql) => !/available_blobs|content_body_chunks|content_blob_data/u.test(sql))).toBe(true);
    expect(host.sqlite.prepare('SELECT length(data) FROM framed_sync_available_blobs').pluck().get()).toBeGreaterThan(3 * 1024 * 1024);
  } finally { host.close(); }
});

it('keeps ready metadata available after caller transaction failure and rejects the expired transaction', async () => {
  const host = await reopenedReadyFixture();
  try {
    let expired: DbPort | undefined;
    await expect(host.db.transaction(async (tx) => {
      expired = tx;
      expect((await loadDesktopFramedSyncReadyFacts(tx, host.published))?.facts).toEqual([host.fact]);
      await tx.run("UPDATE framed_sync_inbound_transfers SET state = 'applied'");
      throw new Error('business_failure');
    })).rejects.toThrow('business_failure');
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    await expect(loadDesktopFramedSyncReadyFacts(expired!, host.published)).rejects.toThrow();
    expect((await host.db.transaction((tx) => loadDesktopFramedSyncReadyFacts(tx, host.published)))?.facts).toEqual([host.fact]);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each([
  ['manifest', 'framed_sync_ready_manifest_mismatch'],
  ['content', 'framed_sync_ready_manifest_mismatch'],
  ['context', 'framed_sync_transfer_context_mismatch'],
  ['protocol', 'framed_sync_transfer_context_mismatch'],
  ['fact_body', 'outbound_manifest_identity_mismatch'],
  ['header_descriptor', 'inbound_manifest_header_mismatch']
] as const)(
  'rejects changed %s while preserving ready ownership', async (kind, error) => {
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
      await expect(loadDesktopFramedSyncReadyFacts(host.db, published)).rejects.toThrow(error);
      expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
      expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
    } finally { host.close(); }
  });

it('returns null when the durable transfer is not ready', async () => {
  const host = await reopenedReadyFixture();
  try {
    host.sqlite.exec("UPDATE framed_sync_inbound_transfers SET state = 'receiving'");
    expect(await loadDesktopFramedSyncReadyFacts(host.db, host.published)).toBeNull();
  } finally { host.close(); }
});
