import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import { orderNodeVersionHistory } from './syncNodeVersionHistory.js';

/** A forwarded head travels with this device's retained full chain, never another device's proofs. */
export async function includeRetainedNodePushHistory(port: DbPort, records: NativeSyncNodeRecord[]) {
  const byId = new Map(records.map((record) => [record.version_id, record]));
  for (const nodeId of new Set(records.filter((record) => !record.is_tombstone).map((record) => record.object_id))) {
    const versions = await port.query<{ version_id: string }>(
      'SELECT version_id FROM node_sync_versions WHERE object_id = ? ORDER BY created_at, version_id', [nodeId]);
    for (const version of versions) {
      if (byId.has(version.version_id)) continue;
      const record = await loadStoredSyncNodeVersionRecord(port, version.version_id);
      if (record) byId.set(version.version_id, record);
    }
  }
  return orderNodeVersionHistory([...byId.values()]);
}
