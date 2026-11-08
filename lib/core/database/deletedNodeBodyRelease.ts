import type { DbPort } from '../sync/dbPort.js';
import { chainMutationStatements } from '../sync/nodeVersionChainSql.js';

import type { DatabaseDriver } from './driver.js';
import { PRESERVE_RELEASED_MAIN_HASH_SQL, releasedVersionBodyHashesWithDriver,
  releasedVersionBodyHashesWithPort } from './releasedVersionBodyHashes.js';

const NODE_VERSION_IDS_SQL = 'SELECT version_id FROM node_sync_versions WHERE object_id = ? ORDER BY version_id';
/** The deletion keeps its identity and hash; the words it once covered are gone. */
const RELEASED_TOMBSTONE_SNAPSHOT_SQL = `json_remove(json_set(snapshot_json,
  '$.content', NULL, '$.body_deleted', json('true'), '$.opening_text', NULL, '$.title', ''), '$.text_alternative_bodies')`;
const STRIP_TOMBSTONE_BODY_SQL = `UPDATE node_sync_tombstones SET snapshot_json = ${RELEASED_TOMBSTONE_SNAPSHOT_SQL}`;
/** The opening excerpt and the title are taken from the text itself, so they go with it. */
const STRIP_DERIVED_TEXT_SQL = `UPDATE node_sync_versions
  SET snapshot_json = json_set(snapshot_json, '$.opening_text', NULL, '$.title', '')`;
export const DELETED_NODE_SQL = `SELECT 1 AS deleted FROM node_sync_tombstones tomb
  WHERE tomb.node_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = tomb.node_id)`;

/** Permanent deletion keeps every version's identity and hash but no longer any of the note's text. */
export function releaseDeletedNodeBodiesWithDriver(driver: DatabaseDriver, nodeId: string) {
  const hashes = new Set<string>();
  for (const { version_id: id } of driver.queryAll<{ version_id: string }>(NODE_VERSION_IDS_SQL, [nodeId])) {
    const released = releasedVersionBodyHashesWithDriver(driver, id);
    for (const hash of released.hashes) hashes.add(hash);
    if (released.mainBodyHash) driver.execute(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, id]);
    for (const statement of chainMutationStatements({ removed: [id] })) driver.execute(statement.sql, statement.params);
  }
  driver.execute(`${STRIP_DERIVED_TEXT_SQL} WHERE object_id = ?`, [nodeId]);
  driver.execute(`${STRIP_TOMBSTONE_BODY_SQL} WHERE node_id = ?`, [nodeId]);
  return [...hashes];
}

export async function releaseDeletedNodeBodiesWithPort(port: DbPort, nodeId: string) {
  return releaseDeletedNodeBodiesForBatch(port, [nodeId]);
}

export async function releaseDeletedNodeBodiesForBatch(port: DbPort, nodeIds: readonly string[]) {
  if (!nodeIds.length) return [];
  const ids = JSON.stringify(nodeIds);
  const hashes = new Set<string>();
  const versions = await port.query<{ version_id: string }>(`SELECT version_id FROM node_sync_versions
    WHERE object_id IN (SELECT value FROM json_each(?)) ORDER BY object_id, version_id`, [ids]);
  for (const { version_id: id } of versions) {
    const released = await releasedVersionBodyHashesWithPort(port, id);
    for (const hash of released.hashes) hashes.add(hash);
    if (released.mainBodyHash) await port.run(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, id]);
    for (const statement of chainMutationStatements({ removed: [id] })) await port.run(statement.sql, statement.params);
  }
  await port.run(`${STRIP_DERIVED_TEXT_SQL} WHERE object_id IN (SELECT value FROM json_each(?))`, [ids]);
  await port.run(`${STRIP_TOMBSTONE_BODY_SQL} WHERE node_id IN (SELECT value FROM json_each(?))
    AND snapshot_json IS NOT ${RELEASED_TOMBSTONE_SNAPSHOT_SQL}`, [ids]);
  return [...hashes];
}
