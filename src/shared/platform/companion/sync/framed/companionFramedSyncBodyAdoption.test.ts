// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../../../../../../lib/core/database/bodyContentSchema.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/companionSchemaStatements.js';
import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { readBodyText } from '../../../../../../lib/core/sync/verifiedBody.js';

import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';
import { adoptCompanionStagedBody } from './companionFramedSyncBodyAdoption.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';

const closers: Array<() => void> = [];
const now = '2026-10-07T00:00:00.000Z';
afterEach(() => closers.splice(0).reverse().forEach((close) => close()));

function fixture(kind: 'android' | 'ios', text: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-body-adoption-'));
  closers.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const stagingPath = path.join(root, 'staging.db');
  const staging = new Database(stagingPath);
  const main = new Database(':memory:');
  closers.push(() => staging.close(), () => main.close());
  main.exec([...COMPANION_SCHEMA_STATEMENTS, ...BODY_CONTENT_SCHEMA].join(';\n'));
  const tables = STAGING_TABLES[kind];
  installCompanionFramedSyncStaging(staging, tables.prefix);
  const data = new TextEncoder().encode(text);
  const descriptor = { sha256: sha256(data), byteLength: BigInt(data.length), role: 1, required: true };
  const input = { stagingKind: kind, stagingPath, transferId: new Uint8Array(32).fill(1),
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' };
  staging.prepare(`INSERT INTO ${tables.prefix}_transfers VALUES (?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`)
    .run(input.transferId, new Uint8Array(32).fill(2), 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', new Uint8Array(16));
  staging.prepare(`INSERT INTO ${tables.prefix}_available_blobs VALUES (?, ?, ?)`).run(descriptor.sha256, data.length, data);
  staging.prepare(`INSERT INTO ${tables.prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
    .run(input.transferId, descriptor.sha256, data.length, descriptor.role, 1);
  main.prepare(`ATTACH DATABASE ? AS ${tables.alias}`).run(stagingPath);
  return { main, staging, port: createBetterSqliteDbPort(main), input, descriptor, tables };
}

function observed(port: DbPort) {
  const sizes: number[] = [];
  const check = (value: unknown) => { if (value instanceof Uint8Array) sizes.push(value.byteLength); };
  const result: DbPort = {
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      const rows = await port.query<T>(sql, params);
      for (const row of rows) Object.values(row).forEach(check);
      return rows;
    },
    async run(sql, params = []) { params.forEach(check); return port.run(sql, params); },
    transaction: (execute) => port.transaction((tx) => execute(observed(tx).port))
  };
  return { port: result, sizes };
}

it.each(['android', 'ios'] as const)('adopts %s Unicode bodies and empty bodies without whole-body bridge values', async (kind) => {
  const text = `---\nkey: value\n---\n${'中😀'.repeat(500_000)}\uFEFFtail`;
  const host = fixture(kind, text);
  const reads = observed(host.port);
  const ref = await host.port.transaction(() => adoptCompanionStagedBody(reads.port, host.input, host.descriptor, now));
  expect(ref.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  expect(ref.utf16Length).toBe(text.length);
  expect(ref.frontmatterEnd).toBe(19);
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
  expect(reads.sizes.filter((size) => size > 32)).toHaveLength(Math.ceil(ref.byteLength / BODY_CONTENT_CHUNK_BYTES));
  expect(await readBodyText(host.port, ref)).toBe(text);
  await host.port.transaction(() => adoptCompanionStagedBody(host.port, host.input, host.descriptor, now));
  host.staging.exec(`DELETE FROM ${host.tables.prefix}_blob_pins; DELETE FROM ${host.tables.prefix}_available_blobs`);
  expect(await readBodyText(host.port, ref)).toBe(text);
  const empty = fixture(kind, '');
  const emptyRef = await empty.port.transaction((tx) => adoptCompanionStagedBody(tx, empty.input, empty.descriptor, now));
  expect(emptyRef.byteLength).toBe(0);
  expect(await readBodyText(empty.port, emptyRef)).toBe('');
  expect(empty.main.prepare('SELECT COUNT(*) FROM content_body_chunks').pluck().get()).toBe(0);
});

it.each(['android', 'ios'] as const)('rejects %s ready identity, pins, and available header mismatches', async (kind) => {
  const host = fixture(kind, 'Original');
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx,
    { ...host.input, senderDeviceId: 'other' }, host.descriptor, now))).rejects.toThrow('framed_sync_transfer_context_mismatch');
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input,
    { ...host.descriptor, required: false }, now))).rejects.toThrow('framed_sync_body_pin_mismatch');
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input,
    { ...host.descriptor, sha256: new Uint8Array(32).fill(9) }, now))).rejects.toThrow('framed_sync_body_pin_mismatch');
  host.staging.exec(`UPDATE ${host.tables.prefix}_available_blobs SET byte_length = 7`);
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('framed_sync_body_pin_mismatch');
  host.staging.exec(`UPDATE ${host.tables.prefix}_transfers SET state = 'receiving'`);
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('framed_sync_transfer_not_ready');
  host.staging.exec(`UPDATE ${host.tables.prefix}_transfers SET state = 'ready_to_apply'; DELETE FROM ${host.tables.prefix}_blob_pins`);
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('framed_sync_body_pin_mismatch');
  host.staging.exec(`UPDATE ${host.tables.prefix}_available_blobs SET byte_length = 8, data = X'00'`);
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('framed_sync_body_pin_mismatch');
  expect(host.main.prepare('SELECT COUNT(*) FROM content_bodies').pluck().get()).toBe(0);
});

it.each(['android', 'ios'] as const)('adopts %s external document body references through the same storage contract', async (kind) => {
  const host = fixture(kind, 'External body');
  host.staging.exec(`UPDATE ${host.tables.prefix}_blob_pins SET role = 5`);
  const ref = await host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, { ...host.descriptor, role: 5 }, now));
  expect(await readBodyText(host.port, ref)).toBe('External body');
});

it.each(['android', 'ios'] as const)('rolls back %s business failure while retaining ready bytes for retry', async (kind) => {
  const host = fixture(kind, 'Original');
  await expect(host.port.transaction(async (tx) => {
    await adoptCompanionStagedBody(tx, host.input, host.descriptor, now);
    throw new Error('business_failure');
  })).rejects.toThrow('business_failure');
  expect(host.main.prepare('SELECT COUNT(*) FROM content_bodies').pluck().get()).toBe(0);
  expect(host.main.prepare('SELECT COUNT(*) FROM content_body_chunks').pluck().get()).toBe(0);
  expect(host.main.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(0);
  expect(host.staging.prepare(`SELECT state FROM ${host.tables.prefix}_transfers`).pluck().get()).toBe('ready_to_apply');
  const ref = await host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now));
  expect(await readBodyText(host.port, ref)).toBe('Original');
});

it.each(['android', 'ios'] as const)('rejects %s corrupt raw bytes and existing stable chunk differences', async (kind) => {
  const host = fixture(kind, 'Original');
  host.staging.prepare(`UPDATE ${host.tables.prefix}_available_blobs SET data = ?`).run(new TextEncoder().encode('Corrupt!'));
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('body_hash_mismatch');
  const hash = Buffer.from(host.descriptor.sha256).toString('hex');
  host.main.prepare('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, 8, 0)').run(hash);
  host.main.prepare('INSERT INTO content_body_chunks VALUES (?, 0, ?)').run(hash, new TextEncoder().encode('Original'));
  await expect(host.port.transaction((tx) => adoptCompanionStagedBody(tx, host.input, host.descriptor, now)))
    .rejects.toThrow('body_chunk_identity_conflict');
});
