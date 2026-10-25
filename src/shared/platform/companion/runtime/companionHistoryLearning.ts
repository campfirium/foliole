import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { writeNodeReadingObject, writeNodeReviewObject } from '../../../../../lib/core/sync/syncObjectLearningPayloadExecutor';
import { isSameReadingProfile } from '../../../../store/workspaceActionHistoryReading';
import type { WorkspaceRelatedReading } from '../../../../store/workspaceNodeMetadataHistory';
import { toReadingPayload } from '../../companionSyncStateWriters';

import { saveIosReadingWithDb } from './iosCompanionActiveDatabaseWrites';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

export async function writeCompanionHistoryReadings(db: DbPort, changes: WorkspaceRelatedReading[], mode: 'undo' | 'redo') {
  const host = await iosCompanionHostName(db);
  for (const change of changes) {
    const node = await loadCompanionWorkspaceNodeFromDb(db, change.nodeId, host);
    const expected = mode === 'undo' ? change.afterReading : change.beforeReading;
    if (!node || !isSameReadingProfile(node.reading, expected)) throw new Error('workspace_history_reading_changed');
    const target = mode === 'undo' ? change.beforeReading : change.afterReading;
    if (target) await saveIosReadingWithDb(db, { node_id: change.nodeId, reading_json: JSON.stringify(toReadingPayload(target)) });
    else await clearCompanionHistoryLearning(db, 'node_reading', change.nodeId);
  }
}

export async function clearCompanionHistoryLearning(db: DbPort, objectType: 'node_reading' | 'node_review', nodeId: string) {
  const now = new Date().toISOString();
  const contentHash = await iosCompanionContentHash({ deleted_at: now, node_id: nodeId, object_type: objectType });
  const record = { object_type: objectType, object_id: nodeId, content_hash: contentHash,
    payload_json: '{}', deleted_at: now, updated_at: now };
  if (objectType === 'node_review') await writeNodeReviewObject(db, record);
  else await writeNodeReadingObject(db, record);
  await markIosCompanionMutation({ db, objectType, objectId: nodeId, updatedAt: now,
    hostName: await iosCompanionHostName(db), contentHash });
  await db.run('UPDATE sync_object_state SET deleted_at = ? WHERE object_type = ? AND object_id = ?', [now, objectType, nodeId]);
}
