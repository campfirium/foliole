import { ANDROID_COMPANION_SYNC_NODE_VERSION_IDENTITIES_SQL } from '../../../../../../lib/core/database/androidCompanionSyncNodeVersionSql';
import { COMPANION_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionSyncbackHostContractDefinitions';
import type { DbPort, DbParams } from '../../../../../../lib/core/sync/dbPort';
import type { NativeSyncChangeCursor } from '../../../../../../lib/platform/nativeSyncContract';

import { loadRequiredMeta } from './companionSyncbackCursorStore';

export interface CompanionPendingSyncCursors {
  node: NativeSyncChangeCursor | null;
  state: number | null;
  review: NativeSyncChangeCursor | null;
}

const nodeCountSql = `WITH selected AS (${ANDROID_COMPANION_SYNC_NODE_VERSION_IDENTITIES_SQL})
  SELECT count(*) AS pending_count FROM (
    SELECT version_id FROM selected
    UNION SELECT history.version_id FROM node_sync_versions history
      JOIN selected ON selected.object_id = history.object_id AND selected.is_tombstone = 0
  )`;

async function count(port: DbPort, sql: string, params: DbParams) {
  const [row] = await port.query<{ pending_count: number }>(sql, params);
  return row?.pending_count ?? 0;
}

/** Preserve the old limit-one streams and retained node identity expansion without loading any payload. */
export async function loadCompanionPendingCount(port: DbPort, peerId: string, cursors: CompanionPendingSyncCursors) {
  const hostName = await loadRequiredMeta(port, CONTRACT.hostNameMetaKey);
  const nodeTime = cursors.node?.created_at ?? '', nodeId = cursors.node?.change_id ?? '';
  const reviewTime = cursors.review?.created_at ?? '', reviewId = cursors.review?.change_id ?? '';
  const state = Number.isSafeInteger(cursors.state) && (cursors.state ?? 0) > 0 ? cursors.state! : 0;
  const node = await count(port, nodeCountSql,
    [hostName, nodeTime, nodeId, nodeTime, nodeTime, nodeId, peerId,
      hostName, nodeTime, nodeId, nodeTime, nodeTime, nodeId, peerId, 1]);
  const stateCount = await count(port, `SELECT count(*) AS pending_count FROM (${CONTRACT.sql.state})`, [state, peerId, 1]);
  const review = await count(port, `SELECT count(*) AS pending_count FROM (${CONTRACT.sql.reviewLog})`,
    [hostName, reviewTime, reviewId, reviewTime, reviewTime, reviewId, peerId, 1]);
  return node + stateCount + review;
}
