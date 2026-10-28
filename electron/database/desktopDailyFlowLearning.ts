import { projectParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { loadDailyFlowLearningFromNodeIndex, loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { ownsBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { prepareDesktopNodeIndex, readDesktopNodeIndex } from './desktopNodeIndex.js';

export async function loadDesktopDailyFlowLearning(db: DbPort, ids?: readonly string[]) {
  const { sqlite, driver } = openDatabaseConnection();
  const hostName = requireDatabaseHostName(driver);
  if (ids) return loadDailyFlowLearningSnapshot(db, hostName, ids);
  const owned = ownsBetterSqliteDbPort(db, sqlite);
  if (owned && !sqlite.inTransaction) prepareDesktopNodeIndex(sqlite, loadReviewSchedulerSettings().pushQueue.defaultPriority);
  return db.transaction(async tx => {
    const index = owned ? readDesktopNodeIndex(sqlite) : null;
    if (index) {
      const snapshot = await loadDailyFlowLearningFromNodeIndex(tx, hostName, index.metadata);
      return { ...snapshot, nodeOrder: [...index.nodeOrder], nodePriorities: index.priorities, nodePaths: index.paths };
    }
    // Uncommitted node changes and independent snapshots use their own database facts.
    const snapshot = await loadDailyFlowLearningSnapshot(tx, hostName);
    const rows = await tx.query<{ parent_id: string; child_ids_json: string }>('SELECT parent_id, child_ids_json FROM parent_child_order');
    const members = Object.values(snapshot.nodesById).map(node => ({ id: node.id, parent_id: node.parentNodeId,
      created_at: node.createdAt, deleted_at: node.deletedAt ?? null }));
    return { ...snapshot, nodeOrder: projectParentChildOrder(members,
      new Map(rows.map(row => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]))) };
  });
}
