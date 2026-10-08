import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionFramedSyncInventory } from '../../lib/core/database/framedSyncInventoryMigration.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { STAGING_TABLES } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncStagingTables.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

export type Kind = keyof typeof STAGING_TABLES;
const time = '2026-10-05T01:00:00.000Z';

function nativeStatements(kind: Kind) {
  const filename = kind === 'ios' ? '../../ios/App/App/FolioleFramedSyncTransferDatabase.swift'
    : '../../android/app/src/main/java/com/foliole/android/framed/FramedSyncSQLiteSchema.java';
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
  if (kind === 'ios') return [...source.matchAll(/"""([\s\S]*?)"""/gu)].map((match) => match[1]!.trim());
  return [...source.matchAll(/database\.execSQL\(([\s\S]*?)\);/gu)].map((match) =>
    [...match[1]!.matchAll(/"(?:[^"\\]|\\.)*"/gu)].map((literal) => JSON.parse(literal[0]) as string).join(''));
}

function nodeRecord(body: string): NativeSyncNodeRecord {
  return { ancestor_version_ids: [], body_text: body, content_hash: '4'.repeat(64), host_name: 'sender',
    is_tombstone: false, object_id: 'node-1', object_type: 'node', parent_version_id: null, parent_version_ids: [],
    updated_at: time, version_created_at: time, version_id: 'version-1', snapshot: {
      anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null, attachments: [],
      body_blob_hash: null, content: body, created_at: time, deleted_at: null, desired_retention: null,
      enable_short_term: false, hide_title_heading: false, id: 'node-1', image_regions: null, image_sources: null,
      import_content_fingerprint: null, import_source_fingerprint: null, is_title_manual: true, kind: 'topic',
      manual_child_order: null, opening_text: null, parent_id: null, position: 0, priority: 0,
      resource_references: '[]', reveal: null, sequential_reading_enabled: false, shelved_at: null,
      title: 'Node', updated_at: time, virtual_filter: null
    } };
}

function observed(source: DbPort, sizes: number[]): DbPort {
  return { ...source, async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    assertBoundedValues(params, sizes);
    const rows = await source.query<T>(sql, params);
    for (const row of rows) assertBoundedValues(Object.values(row), sizes);
    return rows;
  }, run(sql, params = []) { assertBoundedValues(params, sizes); return source.run(sql, params); },
  transaction: (run) => source.transaction((tx) => run(observed(tx, sizes))) };
}

function assertBoundedValues(values: readonly unknown[], sizes: number[]) {
  for (const value of values) {
    const size = typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.length : 0;
    sizes.push(size);
    expect(size).toBeLessThanOrEqual(1048576 + 65536);
  }
}

async function initializeMain(main: Database.Database) {
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const db = createBetterSqliteDbPort(main);
  await db.transaction(async (tx) => {
    await migrateCompanionFramedSyncInventory(tx);
    await tx.run('DROP TABLE content_blob_data');
  });
}

export async function verifiedCompanionFixture(kind: Kind, body: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-companion-verified-'));
  const mainPath = path.join(root, 'main.sqlite'), stagingPath = path.join(root, 'native.sqlite');
  let main = new Database(mainPath), native = new Database(stagingPath);
  main.pragma('foreign_keys = ON'); native.pragma('foreign_keys = ON');
  const tables = STAGING_TABLES[kind], prefix = tables.prefix;
  const sizes: number[] = [];
  const projection = projectFramedSyncNodeRecord(nodeRecord(body));
  const descriptor = projection.manifest.blobs[0]!;
  const contentId = await canonicalContentId(projection.manifest);
  const transferId = new Uint8Array(32).fill(1), attemptId = new Uint8Array(16).fill(1);
  const input = { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender',
    senderLibraryEpoch: 'sender-epoch', stagingKind: kind, stagingPath, transferId };
  await initializeMain(main);
  for (const suffix of ['transfers', ...(kind === 'android' ? ['attempts'] : []), 'frames',
    'available_blobs', 'blob_pins', 'available_resources', 'resource_pins']) {
    const name = `${prefix}_${suffix}`;
    const sql = nativeStatements(kind).find((statement) => statement.startsWith(`CREATE TABLE IF NOT EXISTS ${name} (`));
    if (!sql) throw new Error(`native_schema_statement_missing:${name}`);
    native.exec(sql);
  }
  native.prepare(`INSERT INTO ${prefix}_transfers VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`)
    .run(transferId, contentId, Number(descriptor.byteLength), input.senderDeviceId, input.senderLibraryEpoch,
      input.receiverDeviceId, input.receiverLibraryEpoch, attemptId);
  if (kind === 'android') native.prepare(`INSERT INTO ${prefix}_attempts VALUES (?, ?, 'promoted')`).run(transferId, attemptId);
  native.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, '0', 3, ?, ?, ?, ?)`)
    .run(transferId, attemptId, new Uint8Array(96), new Uint8Array(16), Uint8Array.of(1),
      encodeValidatedProtocolMessage('fact', factToWire(projection.manifest.facts[0]!)));
  native.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`).run(descriptor.sha256,
    Number(descriptor.byteLength), projection.bodyBlob);
  native.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, 1, 1)`).run(transferId, descriptor.sha256, Number(descriptor.byteLength));
  native.close();
  native = new Database(stagingPath);
  native.pragma('foreign_keys = ON');
  return { input, descriptor, contentId, sizes, prefix,
    get main() { return main; }, get native() { return native; },
    port() { return observed(createBetterSqliteDbPort(main), sizes); },
    reopen() { main.close(); native.close(); main = new Database(mainPath); native = new Database(stagingPath);
      main.pragma('foreign_keys = ON'); native.pragma('foreign_keys = ON'); },
    close() { main.close(); native.close(); fs.rmSync(root, { recursive: true, force: true }); }
  };
}
