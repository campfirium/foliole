import type { DbPort } from './dbPort.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';
import { eligiblePackVersion } from './syncPackVersionEligibility.js';

export async function loadVerifiedExistingSyncPackVersions(port: DbPort, alias: string) {
  await assertExistingVersionsMatch(port, alias);
  const rows = await port.query<{ version_id: string }>(`SELECT incoming.version_id
    FROM ${alias}.node_sync_versions incoming JOIN main.node_sync_versions held USING (version_id)
    WHERE ${versionBodySql('incoming')} IS NOT NULL AND ${versionBodySql('held')} IS NOT NULL`);
  return rows.map(row => row.version_id);
}

export async function rehydrateStoredVersionBodies(port: DbPort, alias: string) {
  await port.run(
    `UPDATE main.node_sync_versions AS stored SET
       body_text = ${versionBodySql('incoming')}, snapshot_json = incoming.snapshot_json
     FROM ${alias}.node_sync_versions AS incoming
     WHERE stored.version_id = incoming.version_id
       AND ${eligiblePackVersion('incoming', alias)}
       AND json_type(stored.snapshot_json, '$.content') = 'null'
       AND ${versionBodySql('incoming')} IS NOT NULL`
  );
}

async function assertExistingVersionsMatch(port: DbPort, alias: string) {
  const immutableColumns = SYNC_PACK_NODE_VERSION_COLUMNS.filter((column) =>
    !['version_id', 'parent_version_id', 'body_text', 'snapshot_json'].includes(column));
  const mismatch = [
    ...immutableColumns.map((column) => `existing.${column} IS NOT incoming.${column}`),
    `json_remove(existing.snapshot_json, '$.content', '$.body_blob_hash') IS NOT
      json_remove(incoming.snapshot_json, '$.content', '$.body_blob_hash')`,
    `(${versionBodySql('existing')} IS NOT NULL AND ${versionBodySql('incoming')} IS NOT NULL
      AND ${versionBodySql('existing')} IS NOT ${versionBodySql('incoming')})`
  ].join(' OR ');
  const [row] = await port.query<{ version_id: string }>(
    `SELECT incoming.version_id FROM ${alias}.node_sync_versions incoming
     JOIN main.node_sync_versions existing ON existing.version_id = incoming.version_id
     WHERE ${eligiblePackVersion('incoming', alias)} AND (${mismatch}) LIMIT 1`
  );
  if (row) throw new Error(`sync_pack_node_version_immutable_mismatch:${row.version_id}`);
}

function versionBodySql(table: string) {
  return `CASE WHEN ${table}.body_text IS NOT NULL THEN ${table}.body_text
    WHEN json_type(${table}.snapshot_json, '$.content') = 'null' THEN NULL
    WHEN json_type(${table}.snapshot_json, '$.content') IS NULL THEN ''
    WHEN json_type(${table}.snapshot_json, '$.content') = 'text'
      THEN json_extract(${table}.snapshot_json, '$.content')
    ELSE NULL END`;
}
