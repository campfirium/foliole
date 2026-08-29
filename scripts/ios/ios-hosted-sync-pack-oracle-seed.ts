import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import type { SqliteDatabase } from '../../electron/database/connection.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { readHostedPack } from './ios-hosted-sync-pack-evidence.js';
import {
  hostedPackSemanticDigest,
  hostedPackSemanticProjection,
  sqliteIdentifier
} from './ios-hosted-sync-pack-semantics.js';

export async function seedHostedSourceFromOracle(args: {
  oraclePackPath: string;
  source: SqliteDatabase;
  stagingRoot: string;
}) {
  const pack = readHostedPack(args.oraclePackPath);
  const oraclePath = path.join(args.stagingRoot, `${pack.manifest.pack_id}.oracle.db`);
  writeFileSync(oraclePath, pack.database, { flag: 'wx' });
  args.source.prepare('ATTACH DATABASE ? AS oracle_seed').run(oraclePath);
  try {
    await applySyncPackNodeSurfaceWithDbPort(
      createBetterSqliteDbPort(args.source, { name: 'ios-hosted-oracle-seed' }),
      {
        currentCursor: pack.manifest.from_state_seq,
        hostName: oracleHostName(args.source, pack.manifest.from_peer_id),
        incomingAlias: 'oracle_seed',
        sourceHostName: pack.manifest.from_peer_id,
        sourcePeerId: pack.manifest.from_peer_id
      }
    );
    restoreOracleFacts(args.source);
    assertNoGroupState(args.source);
    return {
      fromStateSeq: pack.manifest.from_state_seq,
      oracleSemanticDigest: hostedPackSemanticDigest(args.source, 'oracle_seed'),
      oracleSemanticProjection: hostedPackSemanticProjection(args.source, 'oracle_seed'),
      packId: pack.manifest.pack_id,
      toStateSeq: pack.manifest.to_state_seq
    };
  } finally {
    args.source.exec('DETACH DATABASE oracle_seed');
  }
}

function oracleHostName(database: SqliteDatabase, fallback: string) {
  const rows = database.prepare(
    "SELECT object_id FROM oracle_seed.sync_objects WHERE object_type IN ('setting', 'view_state')"
  ).all() as Array<{ object_id: string }>;
  const names = [...new Set(rows.map((row) => row.object_id.split(':')[3]).filter(Boolean))];
  if (names.length > 1) throw new Error('ios_hosted_oracle_multiple_host_scopes');
  return names[0] ?? fallback;
}

function restoreOracleFacts(database: SqliteDatabase) {
  const replace = database.transaction(() => {
    database.exec('DELETE FROM main.sync_object_state');
    copyCommonColumns(database, 'sync_object_state');
    database.exec('DELETE FROM main.content_blobs');
    copyCommonColumns(database, 'content_blobs');
    restoreAttachmentBlobFacts(database);
  });
  replace();
}

function restoreAttachmentBlobFacts(database: SqliteDatabase) {
  const rows = database.prepare(
    "SELECT object_id, payload_json FROM oracle_seed.sync_objects WHERE object_type = 'attachment'"
  ).all() as Array<{ object_id: string; payload_json: string }>;
  const update = database.prepare(
    `UPDATE main.attachment_blobs SET content_hash = ?, storage_key = ?, size_bytes = ?, mime_type = ?,
       availability = ?, source_host_name = ?, created_at = ?, cached_at = ?, last_verified_at = ?
     WHERE attachment_id = ?`
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as { blob?: Record<string, unknown> };
    const blob = payload.blob ?? {};
    update.run(blob.content_hash, blob.storage_key, blob.size_bytes, blob.mime_type,
      blob.availability, blob.source_host_name, blob.created_at, blob.cached_at,
      blob.last_verified_at, row.object_id);
  }
}

function copyCommonColumns(database: SqliteDatabase, table: string) {
  const sourceColumns = columns(database, 'main', table);
  const oracleColumns = new Set(columns(database, 'oracle_seed', table));
  const shared = sourceColumns.filter((column) => oracleColumns.has(column));
  if (shared.length === 0) throw new Error(`ios_hosted_oracle_seed_columns_missing:${table}`);
  const names = shared.map(sqliteIdentifier).join(', ');
  database.exec(`INSERT INTO main.${sqliteIdentifier(table)} (${names}) SELECT ${names} FROM oracle_seed.${sqliteIdentifier(table)}`);
}

function columns(database: SqliteDatabase, alias: string, table: string) {
  return database.prepare(`PRAGMA ${sqliteIdentifier(alias)}.table_info(${sqliteIdentifier(table)})`).all()
    .map((row) => String((row as { name: unknown }).name));
}

function assertNoGroupState(database: SqliteDatabase) {
  for (const table of ['sync_groups', 'sync_group_devices', 'sync_group_local_state']) {
    const count = database.prepare(`SELECT COUNT(*) AS count FROM ${sqliteIdentifier(table)}`).get() as { count: number };
    if (count.count !== 0) throw new Error(`ios_hosted_source_group_state_present:${table}`);
  }
}
