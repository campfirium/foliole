import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { resolveTopicConflict } from './syncNodeConvergence.js';

export interface LocalContentEditOptions {
  enqueueSearchInvalidations?: boolean;
}

export async function applyEditorSyncNodeRecord(db: DbPort, record: NativeSyncNodeRecord,
  options: LocalContentEditOptions = {}) {
  return applySyncNodesWithDbPort(db, [record], { ...options, operation: 'local_mutation' });
}

export async function applyLocalContentEditBranch(db: DbPort, record: NativeSyncNodeRecord,
  options: LocalContentEditOptions) {
  const result = await applyEditorSyncNodeRecord(db, record, options);
  if (result.blockedIds.length || result.tombstoneBlockedIds.length) throw new Error('content_edit_blocked');
  if (!result.conflictNodes.length) return;
  if (record.snapshot.kind !== 'topic') throw new Error('content_edit_conflict_requires_topic');
  await resolveTopicConflict(db, result.conflictNodes);
}
