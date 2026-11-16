import type { DbPort } from './dbPort.js';
import { isStoredAncestorVersion, loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import type { SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { isNodeVersionIdentityOnly, prepareIncomingNodeVersionSource, retainIncomingNodeVersionSource } from './syncNodeVersionHistory.js';

export type RequestSyncCurrentVersion = { globalId: string; versionId: string };

/** These references already describe the local projection and need no version writes to resolve. */
export async function alreadyProjectedRequestSyncVersions(db: DbPort, references: readonly RequestSyncCurrentVersion[]) {
  if (!references.length) return true;
  const rows = await db.query<{ available: number }>(`WITH requested AS (
      SELECT json_extract(value, '$.globalId') AS object_id, json_extract(value, '$.versionId') AS version_id
      FROM json_each(?)
    ), available AS (
      SELECT node.id AS object_id, version.version_id FROM requested
      JOIN nodes node ON node.id = requested.object_id AND node.current_version_id = requested.version_id
      JOIN node_sync_versions version ON version.version_id = requested.version_id AND version.object_id = requested.object_id
      WHERE version.body_text IS NOT NULL OR json_type(version.snapshot_json, '$.content') = 'text'
      UNION
      SELECT tomb.node_id, tomb.version_id FROM requested JOIN node_sync_tombstones tomb
      ON tomb.node_id = requested.object_id AND tomb.version_id = requested.version_id
    ) SELECT COUNT(*) AS available FROM available`, [JSON.stringify(references)]);
  return rows[0]?.available === references.length;
}

/** A trusted reference reuses stored content through the ordinary conflict rules. */
export async function withRequestSyncCurrentVersion(db: DbPort, source: SyncNodeRecordSource,
  reference?: RequestSyncCurrentVersion, deferHistory = false): Promise<SyncNodeRecordSource> {
  if (!reference) return source;
  const sole = source.records.length === 1 ? source.records[0] : undefined;
  // An unchanged source is validated and retained by the ordinary apply transaction.
  if (sole?.version_id === reference.versionId && sole.object_id === reference.globalId &&
      !source.isIdentityOnly(sole)) return source;
  if (!deferHistory) {
    const history = await prepareIncomingNodeVersionSource(db, source);
    await retainIncomingNodeVersionSource(db, source, history, true);
  }
  const incoming = source.records.find(record => record.version_id === reference.versionId);
  if (incoming) {
    if (incoming.object_id !== reference.globalId || source.isIdentityOnly(incoming)) {
      throw new Error('request_sync_current_version_unavailable');
    }
    return { ...source, records: [incoming] };
  }
  const [stored] = await db.query<{ object_id: string; available: number; current_version_id: string | null; sync_dirty: number }>(
    `SELECT version.object_id, (version.body_text IS NOT NULL OR
      json_type(version.snapshot_json, '$.content') = 'text' OR tomb.version_id IS NOT NULL) AS available,
      COALESCE(node.current_version_id, (SELECT deletion.version_id FROM node_sync_tombstones deletion
        WHERE deletion.node_id = version.object_id)) AS current_version_id,
      COALESCE(node.sync_dirty, 0) AS sync_dirty FROM node_sync_versions version
      LEFT JOIN nodes node ON node.id = version.object_id
      LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = version.object_id AND tomb.version_id = version.version_id
      WHERE version.version_id = ?
      UNION ALL SELECT node_id AS object_id, 1 AS available, version_id AS current_version_id, 0 AS sync_dirty
      FROM node_sync_tombstones WHERE version_id = ? LIMIT 1`, [reference.versionId, reference.versionId]);
  // An older version of a permanently deleted node is an ancestor of its deletion: nothing to apply.
  if (stored?.object_id === reference.globalId && stored.current_version_id && stored.sync_dirty === 0 &&
      stored.current_version_id !== reference.versionId && await isStoredAncestorVersion(db, reference.versionId,
        stored.current_version_id, deferHistory ? await pendingVersionParents(db, source) : undefined)) return { ...source, records: [] };
  if (!stored || stored.object_id !== reference.globalId || !stored.available) {
    throw new Error('request_sync_current_version_unavailable');
  }
  if (stored.current_version_id === reference.versionId) return { ...source, records: [] };
  const record = await loadRetainedSyncNodeVersionFact(db, reference.versionId, false);
  if (!record || record.object_id !== reference.globalId || isNodeVersionIdentityOnly(record)) {
    throw new Error('request_sync_current_version_unavailable');
  }
  return { records: [record],
    isIdentityOnly: metadata => metadata === record ? false : source.isIdentityOnly(metadata),
    load: (tx, metadata) => metadata === record ? Promise.resolve(record) : source.load(tx, metadata) };
}

async function pendingVersionParents(db: DbPort, source: SyncNodeRecordSource) {
  if (!source.records.length) return [];
  return (await prepareIncomingNodeVersionSource(db, source)).flatMap(record =>
    (record.parent_version_ids ?? (record.parent_version_id ? [record.parent_version_id] : []))
      .map(parentId => [record.version_id!, parentId] as const));
}

/** Selects each object's trusted reference separately when one call applies several received objects. */
export async function withRequestSyncCurrentVersions(db: DbPort, source: SyncNodeRecordSource,
  references: readonly RequestSyncCurrentVersion[], rejected?: Map<string, string>): Promise<SyncNodeRecordSource> {
  const byObject = new Map<string, typeof source.records[number][]>();
  for (const record of source.records) byObject.set(record.object_id, [...byObject.get(record.object_id) ?? [], record]);
  const reference = new Map(references.map(value => [value.globalId, value]));
  const owners = new Map<typeof source.records[number], SyncNodeRecordSource>();
  for (const objectId of new Set([...byObject.keys(), ...reference.keys()])) {
    const part = { ...source, records: byObject.get(objectId) ?? [] };
    let selected;
    try { selected = await withRequestSyncCurrentVersion(db, part, reference.get(objectId), Boolean(rejected)); }
    catch (error) {
      if (!rejected || !(error instanceof Error) || error.message !== 'request_sync_current_version_unavailable') throw error;
      rejected.set(objectId, error.message);
      continue;
    }
    for (const record of selected.records) owners.set(record, selected);
  }
  const owner = (record: typeof source.records[number]) => {
    const value = owners.get(record);
    if (!value) throw new Error('request_sync_current_version_source_changed');
    return value;
  };
  return { records: [...owners.keys()], isIdentityOnly: record => owner(record).isIdentityOnly(record),
    load: (tx, record) => owner(record).load(tx, record) };
}
