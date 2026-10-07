// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncReadyFactFrames, type FramedSyncReadyFactSource } from '../../lib/core/sync/framedSyncReadyFactFrames.js';

import { reopenedReadyFixture } from './desktopFramedSyncReadyFacts.testSupport.js';

const sources = ['desktop', 'android', 'ios'] as const;

async function fixture(source: FramedSyncReadyFactSource) {
  const host = await reopenedReadyFixture(13);
  const [attempt] = await host.db.query<{ active_attempt_id: Uint8Array }>(
    'SELECT active_attempt_id FROM framed_sync_inbound_transfers');
  if (source !== 'desktop') {
    const alias = source === 'android' ? 'framed_android' : 'framed_ios';
    host.sqlite.exec(`ATTACH DATABASE ':memory:' AS ${alias}`);
    host.sqlite.exec(`CREATE TABLE ${alias}.framed_sync_${source}_frames AS SELECT
      transfer_id, attempt_id, sequence, frame_type, preamble, frame_header, ciphertext, authenticated_plaintext
      FROM framed_sync_inbound_frames`);
  }
  return { ...host, attemptId: attempt!.active_attempt_id };
}

it.each(sources)('reads %s attached ready facts in numeric sequence order with one metadata row per query', async (source) => {
  const host = await fixture(source);
  try {
    const seen: string[] = [];
    const metadata: DbPort = { ...host.db,
      async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
        expect(sql).not.toMatch(/available_blobs|content_blob_data|content_body_chunks/u);
        const rows = await host.db.query<T>(sql, params);
        expect(rows.length).toBeLessThanOrEqual(1);
        for (const row of rows) {
          expect(Object.keys(row).sort()).toEqual(['authenticated_plaintext', 'sequence']);
          expect((row.authenticated_plaintext as Uint8Array).byteLength).toBeLessThan(4096);
          seen.push(String(row.sequence));
        }
        return rows;
      }
    };
    expect(await readFramedSyncReadyFactFrames(metadata, host.published.transferId, host.attemptId, source)).toEqual(host.facts);
    expect(seen).toEqual(Array.from({ length: 13 }, (_, index) => String(index)));
    expect(await readFramedSyncReadyFactFrames(metadata, host.published.transferId, new Uint8Array(16), source)).toEqual([]);
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(sources)('rejects malformed authenticated %s fact bytes without changing ready ownership', async (source) => {
  const host = await fixture(source);
  try {
    const table = source === 'desktop' ? 'framed_sync_inbound_frames'
      : `${source === 'android' ? 'framed_android' : 'framed_ios'}.framed_sync_${source}_frames`;
    host.sqlite.prepare(`UPDATE ${table} SET authenticated_plaintext = ? WHERE sequence = '10'`).run(Uint8Array.of(255));
    await expect(readFramedSyncReadyFactFrames(host.db, host.published.transferId, host.attemptId, source)).rejects.toThrow();
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  } finally { host.close(); }
});
