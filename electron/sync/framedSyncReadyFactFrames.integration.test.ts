// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { readFramedSyncReadyFactFrames, streamFramedSyncReadyFactFrames, type FramedSyncReadyFactSource } from '../../lib/core/sync/framedSyncReadyFactFrames.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

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

function streamFixture(source: FramedSyncReadyFactSource) {
  const sqlite = new Database(':memory:');
  const alias = source === 'android' ? 'framed_android' : 'framed_ios';
  if (source !== 'desktop') sqlite.exec(`ATTACH DATABASE ':memory:' AS ${alias}`);
  const table = source === 'desktop' ? 'framed_sync_inbound_frames' : `${alias}.framed_sync_${source}_frames`;
  sqlite.exec(`CREATE TABLE ${table} (transfer_id BLOB, attempt_id BLOB, sequence TEXT,
    frame_type INTEGER, authenticated_plaintext BLOB, PRIMARY KEY (transfer_id, attempt_id, sequence))`);
  const transferId = new Uint8Array(32).fill(1);
  const attemptId = new Uint8Array(16).fill(2);
  const facts = ['2', '9', '10', '100'].map((sequence) => ({ sequence, fact: {
    blobs: [], body: [], factId: `fact-${sequence}`, globalId: 'node', kind: 1,
    objectType: 'node', sharedStateHash: new Uint8Array(32).fill(3)
  } }));
  const insert = sqlite.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?)`);
  for (const { sequence, fact } of [...facts].reverse()) insert.run(transferId, attemptId, sequence, 3,
    encodeValidatedProtocolMessage('fact', factToWire(fact)));
  insert.run(new Uint8Array(32).fill(4), attemptId, '0', 3, Uint8Array.of(255));
  insert.run(transferId, new Uint8Array(16).fill(5), '1', 3, Uint8Array.of(255));
  insert.run(transferId, attemptId, '3', 1, Uint8Array.of(255));
  return { sqlite, db: createBetterSqliteDbPort(sqlite), table, transferId, attemptId, facts };
}

it.each(sources)('replays the %s stream in decimal order while isolating transfer, attempt and control payloads', async (source) => {
  const host = streamFixture(source);
  try {
    for (let replay = 0; replay < 2; replay++) {
      const result = [];
      for await (const frame of streamFramedSyncReadyFactFrames(host.db, host.transferId, host.attemptId, source)) result.push(frame);
      expect(result).toEqual(host.facts);
    }
    expect(await readFramedSyncReadyFactFrames(host.db, host.transferId, host.attemptId, source))
      .toEqual(host.facts.map((frame) => frame.fact));
  } finally { host.sqlite.close(); }
});

it.each(sources)('stops %s payload queries immediately on return and rejects the next malformed fact on replay', async (source) => {
  const host = streamFixture(source);
  try {
    host.sqlite.prepare(`UPDATE ${host.table} SET authenticated_plaintext = ?
      WHERE transfer_id = ? AND attempt_id = ? AND sequence = '9'`)
      .run(new Uint8Array(3 * 1024 * 1024).fill(255), host.transferId, host.attemptId);
    const seen: string[] = [];
    const observed: DbPort = { ...host.db,
      async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
        const rows = await host.db.query<T>(sql, params);
        expect(rows.length).toBeLessThanOrEqual(1);
        seen.push(...rows.map((row) => String(row.sequence)));
        return rows;
      }
    };
    const stream = streamFramedSyncReadyFactFrames(observed, host.transferId, host.attemptId, source);
    expect((await stream.next()).value).toEqual(host.facts[0]);
    await stream.return(undefined);
    expect(seen).toEqual(['2']);
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(seen).toEqual(['2']);
    const replay = streamFramedSyncReadyFactFrames(host.db, host.transferId, host.attemptId, source);
    expect((await replay.next()).value).toEqual(host.facts[0]);
    await expect(replay.next()).rejects.toThrow();
  } finally { host.sqlite.close(); }
});
