import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import type { SqliteDatabase } from '../../electron/database/connection.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { IOS_SYNC_PACK_RESTORE_VERSION_ID } from '../../lib/platform/iosSyncPackAcceptanceContract.js';

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
    ensureOracleNodeTombstones(args.source);
    ensureOracleExternalReferenceColumns(args.source);
    canonicalizeOracleAttachmentPayloads(args.source);
    // The successor predicts this scenario's new restore, not a historical user version.
    if (pack.manifest.pack_id === 'ios-acceptance-successor') {
      await canonicalizeScenarioRestoreVersion(args.source);
    }
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

function ensureOracleNodeTombstones(database: SqliteDatabase) {
  const statement = PACK_SCHEMA.find((sql) => sql.startsWith('CREATE TABLE node_sync_tombstones ('));
  if (!statement) throw new Error('ios_hosted_oracle_tombstone_schema_missing');
  database.exec(statement.replace(
    'CREATE TABLE node_sync_tombstones',
    'CREATE TABLE IF NOT EXISTS oracle_seed.node_sync_tombstones'
  ));
}

interface ScenarioRestoreVersionRow {
  body_text: string | null;
  created_at: string;
  host_name: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
  content_hash: string;
}

async function canonicalizeScenarioRestoreVersion(database: SqliteDatabase) {
  const version = database.prepare(
    'SELECT * FROM oracle_seed.node_sync_versions WHERE version_id = ?'
  ).get(IOS_SYNC_PACK_RESTORE_VERSION_ID) as ScenarioRestoreVersionRow | undefined;
  const row = database.prepare(
    'SELECT * FROM oracle_seed.nodes WHERE id = ?'
  ).get(version?.object_id) as WorkspaceNodeRowShape | undefined;
  if (!version || !row || row.current_version_id !== version.version_id) {
    throw new Error('ios_hosted_scenario_restore_version_missing');
  }
  if (createHash('sha256').update(version.snapshot_json).digest('hex') !== version.content_hash) {
    throw new Error('ios_hosted_scenario_restore_oracle_corrupt');
  }
  const current = await toWorkspaceNativeNodeVersion({
    ...buildWorkspaceSnapshotNode(row), currentVersionId: version.parent_version_id,
    deletedAt: null, updatedAt: version.created_at
  }, version.host_name, version.version_id);
  const { image_sources: imageSources, ...otherFields } = current.snapshot;
  if (imageSources !== '{}' || !isDeepStrictEqual(otherFields, JSON.parse(version.snapshot_json)) ||
      current.body_text !== version.body_text) {
    throw new Error('ios_hosted_scenario_restore_version_drift');
  }
  const updatedVersion = database.prepare(
    'UPDATE oracle_seed.node_sync_versions SET content_hash = ?, snapshot_json = ? WHERE version_id = ?'
  ).run(current.content_hash, JSON.stringify(current.snapshot), version.version_id);
  const updatedState = database.prepare(
    `UPDATE oracle_seed.sync_object_state SET content_hash = ?
     WHERE object_type = 'node' AND object_id = ? AND content_hash = ?`
  ).run(current.content_hash, version.object_id, version.content_hash);
  if (updatedVersion.changes !== 1 || updatedState.changes !== 1) {
    throw new Error('ios_hosted_scenario_restore_state_drift');
  }
}

function canonicalizeOracleAttachmentPayloads(database: SqliteDatabase) {
  const rows = database.prepare(
    "SELECT object_id, payload_json FROM oracle_seed.sync_objects WHERE object_type = 'attachment'"
  ).all() as Array<{ object_id: string; payload_json: string }>;
  const updateObject = database.prepare(
    `UPDATE oracle_seed.sync_objects SET content_hash = ?, payload_json = ?
     WHERE object_type = 'attachment' AND object_id = ?`
  );
  const updateState = database.prepare(
    `UPDATE oracle_seed.sync_object_state SET content_hash = ?
     WHERE object_type = 'attachment' AND object_id = ?`
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown> & { blob?: Record<string, unknown> };
    const blob = payload.blob ?? {};
    const id = String(blob.content_hash ?? row.object_id);
    const mimeType = String(payload.mime_type ?? blob.mime_type ?? '');
    if (!buildCanonicalAttachmentStorageKey(id, mimeType)) {
      throw new Error('ios_hosted_oracle_attachment_address_invalid');
    }
    const canonicalPayload = { attachment_id: id, original_name: payload.original_name == null ? null : String(payload.original_name),
      mime_type: mimeType, size_bytes: Number(payload.size_bytes ?? blob.size_bytes), created_at: String(payload.created_at) };
    const contentHash = computeSyncContentHash('attachment', canonicalPayload);
    updateObject.run(contentHash, JSON.stringify(canonicalPayload), row.object_id);
    updateState.run(contentHash, row.object_id);
    remapOracleAttachmentIdentity(database, row.object_id, id);
  }
}

// The immutable legacy oracle is adapted only inside its isolated acceptance copy.
function remapOracleAttachmentIdentity(database: SqliteDatabase, previousId: string, id: string) {
  for (const table of ['sync_objects', 'sync_object_state']) {
    database.prepare(`UPDATE oracle_seed.${table} SET object_id = ? WHERE object_type = 'attachment' AND object_id = ?`)
      .run(id, previousId);
  }
  database.prepare('UPDATE oracle_seed.node_attachments SET attachment_id = ? WHERE attachment_id = ?').run(id, previousId);
  const pages = database.prepare("SELECT object_id, payload_json FROM oracle_seed.sync_objects WHERE object_type = 'pdf_page_text'")
    .all() as Array<{ object_id: string; payload_json: string }>;
  for (const page of pages) {
    const payload = JSON.parse(page.payload_json);
    if (payload.attachment_id !== previousId) continue;
    payload.attachment_id = id;
    const objectId = `${id}:${payload.page}`;
    const hash = computeSyncContentHash('pdf_page_text', payload);
    database.prepare("UPDATE oracle_seed.sync_objects SET object_id = ?, content_hash = ?, payload_json = ? WHERE object_type = 'pdf_page_text' AND object_id = ?")
      .run(objectId, hash, JSON.stringify(payload), page.object_id);
    database.prepare("UPDATE oracle_seed.sync_object_state SET object_id = ?, content_hash = ? WHERE object_type = 'pdf_page_text' AND object_id = ?")
      .run(objectId, hash, page.object_id);
  }
}

function ensureOracleExternalReferenceColumns(database: SqliteDatabase) {
  const schema = String(database.prepare(
    "SELECT sql FROM oracle_seed.sqlite_master WHERE type = 'table' AND name = 'external_documents'"
  ).pluck().get() ?? '');
  if (!schema.includes('reference_kind')) {
    database.exec("ALTER TABLE oracle_seed.external_documents ADD COLUMN reference_kind TEXT NOT NULL DEFAULT 'local_path'");
  }
  if (!schema.includes('reference_json')) {
    database.exec('ALTER TABLE oracle_seed.external_documents ADD COLUMN reference_json TEXT');
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
  });
  replace();
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
