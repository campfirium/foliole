import type { DbPort } from './dbPort.js';
import { isStoredAncestorVersion, loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import type { SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { isNodeVersionIdentityOnly, prepareIncomingNodeVersionSource, retainIncomingNodeVersionSource } from './syncNodeVersionHistory.js';

export type RequestSyncCurrentVersion = { globalId: string; versionId: string };

/** A trusted reference reuses stored content through the ordinary conflict rules. */
export async function withRequestSyncCurrentVersion(db: DbPort, source: SyncNodeRecordSource,
  reference?: RequestSyncCurrentVersion): Promise<SyncNodeRecordSource> {
  if (!reference) return source;
  const sole = source.records.length === 1 ? source.records[0] : undefined;
  // An unchanged source is validated and retained by the ordinary apply transaction.
  if (sole?.version_id === reference.versionId && sole.object_id === reference.globalId &&
      !source.isIdentityOnly(sole)) return source;
  const history = await prepareIncomingNodeVersionSource(db, source);
  await retainIncomingNodeVersionSource(db, source, history, true);
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
      node.current_version_id, node.sync_dirty FROM node_sync_versions version
      LEFT JOIN nodes node ON node.id = version.object_id
      LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = version.object_id AND tomb.version_id = version.version_id
      WHERE version.version_id = ?
      UNION ALL SELECT node_id AS object_id, 1 AS available, version_id AS current_version_id, 0 AS sync_dirty
      FROM node_sync_tombstones WHERE version_id = ? LIMIT 1`, [reference.versionId, reference.versionId]);
  if (stored?.object_id === reference.globalId && stored.current_version_id && stored.sync_dirty === 0 &&
      stored.current_version_id !== reference.versionId &&
      await isStoredAncestorVersion(db, reference.versionId, stored.current_version_id)) return { ...source, records: [] };
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
