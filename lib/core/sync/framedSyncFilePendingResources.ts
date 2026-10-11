import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { listFramedSyncFileResourceDemands, obsoleteFramedSyncFileResourceDemand } from './framedSyncFileResourceDemands.js';
import type { DemandVersionRow } from './framedSyncPendingResourceRequests.js';
import type { FramedSyncResourceDemandKey } from './framedSyncResourceDemands.js';

type Scope = Pick<FramedSyncResourceDemandKey, 'groupId' | 'receiverDeviceId' | 'receiverLibraryEpoch' | 'globalId'>;

export async function obsoleteFramedSyncFileResourceReferences(files: FramedSyncFilePort, scope: Scope,
  current?: { versionId: string; bodyHash: string; storageKeys: ReadonlySet<string> }) {
  for (const row of await listFramedSyncFileResourceDemands(files, scope)) {
    if (!current || row.key.versionId !== current.versionId || row.key.bodyHash !== current.bodyHash ||
        !current.storageKeys.has(row.key.storageKey)) {
      await obsoleteFramedSyncFileResourceDemand(files, row.key, row.demandId);
    }
  }
}

export async function readFramedSyncFilePendingResourceRows(db: DbPort, files: FramedSyncFilePort,
  scope: Scope, afterId: string, limit: number): Promise<DemandVersionRow[]> {
  const pending = (await listFramedSyncFileResourceDemands(files, scope))
    .filter((row) => row.state === 'pending' && row.demandId > afterId)
    .sort((left, right) => left.demandId < right.demandId ? -1 : left.demandId > right.demandId ? 1 : 0)
    .slice(0, limit);
  const rows: DemandVersionRow[] = [];
  for (const row of pending) {
    const version = row.requestStarted ? null : (await db.query<{ content_hash: string; version_body_hash: string | null }>(
      `SELECT content_hash, json_extract(snapshot_json, '$.body_blob_hash') AS version_body_hash
       FROM node_sync_versions WHERE version_id = ? AND object_id = ?`, [row.key.versionId, row.key.globalId]))[0];
    rows.push({ demand_id: row.demandId, global_id: row.key.globalId, version_id: row.key.versionId,
      body_hash: row.key.bodyHash, storage_key: row.key.storageKey,
      content_hash: row.requestStarted ? (row.sharedStateHash ? bytesToHex(row.sharedStateHash) : null) : version?.content_hash ?? null,
      version_body_hash: row.requestStarted ? row.key.bodyHash : version?.version_body_hash ?? null });
  }
  return rows;
}
