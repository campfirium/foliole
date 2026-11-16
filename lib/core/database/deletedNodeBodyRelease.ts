import type { DbPort } from '../sync/dbPort.js';
import { chainMutationStatements } from '../sync/nodeVersionChainSql.js';
import { deletedVersionMetadataDigest } from '../sync/syncNodeSnapshotIdentity.js';

import type { DatabaseDriver } from './driver.js';
import { PRESERVE_RELEASED_MAIN_HASH_SQL, RELEASED_VERSION_ALTERNATIVE_HASHES_SQL, RELEASED_VERSION_BODY_DESCRIPTOR_FIELDS,
  releasedVersionBodyHashesWithDriver,
  releasedVersionBodyHashesWithPort, type ReleasedVersionBodyDescriptor } from './releasedVersionBodyHashes.js';

type DeletedVersion = { version_id: string; snapshot_metadata: string };
type ReceivedDeletedVersion = DeletedVersion & ReleasedVersionBodyDescriptor & {
  compact_history: number; alternative_hashes: string | null;
};
const VERSION_FIELDS = `node_sync_versions.version_id, json_remove(node_sync_versions.snapshot_json, '$.content', '$.text_alternative_bodies') AS snapshot_metadata`;
const UNCOMPACTED = "json_type(node_sync_versions.snapshot_json, '$.deleted_version_metadata_digest') IS NULL";
const COMPACT_VERSION_SQL = 'UPDATE node_sync_versions SET body_text = NULL, snapshot_json = ? WHERE version_id = ?';
const COMPACT_VERSION_BATCH_SQL = `UPDATE node_sync_versions SET body_text = NULL, snapshot_json = patch.value ->> 1
  FROM json_each(?) AS patch WHERE version_id = patch.value ->> 0`;
const COMPACT_VERSION_BATCH_SIZE = 128;

export function markCompactDeletionSnapshot(snapshot: object) {
  return JSON.stringify({ ...snapshot, compact_version_history: true });
}

export function compactDeletedVersionSnapshot(snapshot: Record<string, unknown>) {
  return JSON.stringify({
    id: snapshot.id, updated_at: snapshot.updated_at, content: null, body_deleted: true,
    deleted_version_metadata_digest: deletedVersionMetadataDigest(snapshot)
  });
}

/** The deletion keeps its identity and hash; the words it once covered are gone. */
const RELEASED_TOMBSTONE_SNAPSHOT_SQL = `json_remove(json_set(snapshot_json,
  '$.content', NULL, '$.body_deleted', json('true'), '$.opening_text', NULL, '$.title', ''), '$.text_alternative_bodies')`;
const STRIP_TOMBSTONE_BODY_SQL = `UPDATE node_sync_tombstones SET snapshot_json = ${RELEASED_TOMBSTONE_SNAPSHOT_SQL}`;
const STRIP_LEGACY_DERIVED_TEXT_SQL = `UPDATE node_sync_versions
  SET snapshot_json = json_set(snapshot_json, '$.opening_text', NULL, '$.title', '')`;
export const DELETED_NODE_SQL = `SELECT 1 AS deleted FROM node_sync_tombstones tomb
  WHERE tomb.node_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = tomb.node_id)`;

export function releaseDeletedNodeBodiesWithDriver(driver: DatabaseDriver, nodeId: string) {
  const hashes = new Set<string>();
  const versions = driver.queryAll<DeletedVersion>(`SELECT ${VERSION_FIELDS} FROM node_sync_versions
    WHERE object_id = ? AND ${UNCOMPACTED} ORDER BY version_id`, [nodeId]);
  for (const version of versions) {
    const released = releasedVersionBodyHashesWithDriver(driver, version.version_id);
    for (const hash of released.hashes) hashes.add(hash);
    driver.execute(COMPACT_VERSION_SQL, [compactDeletedVersionSnapshot(JSON.parse(version.snapshot_metadata)), version.version_id]);
  }
  driver.execute(`${STRIP_TOMBSTONE_BODY_SQL} WHERE node_id = ?`, [nodeId]);
  return [...hashes];
}

export function releaseDeletedNodeBodiesWithPort(port: DbPort, nodeId: string) {
  return releaseDeletedNodeBodiesForBatch(port, [nodeId]);
}

export async function releaseDeletedNodeBodiesForBatch(port: DbPort, nodeIds: readonly string[]) {
  if (!nodeIds.length) return [];
  const ids = JSON.stringify(nodeIds);
  const hashes = new Set<string>();
  const versions = await port.query<ReceivedDeletedVersion>(`SELECT ${VERSION_FIELDS}, ${RELEASED_VERSION_BODY_DESCRIPTOR_FIELDS},
    CASE WHEN json_extract(tomb.snapshot_json, '$.compact_version_history') = 1
      THEN ${RELEASED_VERSION_ALTERNATIVE_HASHES_SQL} END AS alternative_hashes,
    coalesce(json_extract(tomb.snapshot_json, '$.compact_version_history') = 1, 0) AS compact_history
    FROM node_sync_versions LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = node_sync_versions.object_id
    WHERE node_sync_versions.object_id IN (SELECT value FROM json_each(?))
    AND ${UNCOMPACTED} ORDER BY node_sync_versions.object_id, node_sync_versions.version_id`, [ids]);
  const compactVersions: [versionId: string, snapshotJson: string][] = [];
  for (const version of versions) {
    const id = version.version_id;
    const known = version.alternative_hashes === null ? undefined : {
      descriptor: version, alternativeHashes: JSON.parse(version.alternative_hashes) as string[]
    };
    const released = await releasedVersionBodyHashesWithPort(port, id, known);
    for (const hash of released.hashes) hashes.add(hash);
    if (version.compact_history) {
      compactVersions.push([id, compactDeletedVersionSnapshot(JSON.parse(version.snapshot_metadata))]);
      if (compactVersions.length === COMPACT_VERSION_BATCH_SIZE) await flushCompactVersions(port, compactVersions);
    } else {
      await flushCompactVersions(port, compactVersions);
      await releaseLegacyVersionBody(port, id, released.mainBodyHash);
    }
  }
  await flushCompactVersions(port, compactVersions);
  await port.run(`${STRIP_TOMBSTONE_BODY_SQL} WHERE node_id IN (SELECT value FROM json_each(?))
    AND snapshot_json IS NOT ${RELEASED_TOMBSTONE_SNAPSHOT_SQL}`, [ids]);
  return [...hashes];
}

async function flushCompactVersions(port: DbPort, versions: [string, string][]) {
  if (!versions.length) return;
  await port.run(COMPACT_VERSION_BATCH_SQL, [JSON.stringify(versions)]);
  versions.length = 0;
}

async function releaseLegacyVersionBody(port: DbPort, versionId: string, mainBodyHash: string | null) {
  if (mainBodyHash) await port.run(PRESERVE_RELEASED_MAIN_HASH_SQL, [mainBodyHash, versionId]);
  for (const statement of chainMutationStatements({ removed: [versionId] })) {
    await port.run(statement.sql, statement.params);
  }
  await port.run(`${STRIP_LEGACY_DERIVED_TEXT_SQL} WHERE version_id = ?`, [versionId]);
}
