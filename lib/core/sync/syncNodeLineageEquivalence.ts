import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';

interface VersionHashRow extends DbRow {
  content_hash: string;
}

interface VersionIdRow extends DbRow {
  version_id: string;
}

export async function hasContentEquivalentIncomingLineage(
  port: DbPort,
  localVersionId: string | null,
  record: NativeSyncNodeRecord
) {
  if (!localVersionId) return false;
  const [local] = await port.query<VersionHashRow>(
    `SELECT content_hash FROM node_sync_versions
     WHERE version_id = ? AND object_id = ? LIMIT 1`,
    [localVersionId, record.object_id]
  );
  if (!local) return false;
  const incomingLineage = new Set([
    record.version_id,
    ...record.ancestor_version_ids
  ].filter((versionId): versionId is string => Boolean(versionId)));
  const matches = await port.query<VersionIdRow>(
    `SELECT version_id FROM node_sync_versions
     WHERE object_id = ? AND content_hash = ?`,
    [record.object_id, local.content_hash]
  );
  return matches.some((match) => incomingLineage.has(match.version_id));
}
