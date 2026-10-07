import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { resolveTopicConflict } from './syncNodeConvergence.js';
import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { resolveVerifiedTopicConflict } from './syncNodeVerifiedTopicConflict.js';
import { adoptEditorSyncNodeRecord } from './verifiedLocalContentEditRecord.js';

export interface LocalContentEditOptions {
  enqueueSearchInvalidations?: boolean;
  bodyStorage?: NodeVersionBodyStorage;
}

export async function applyEditorSyncNodeRecord(db: DbPort, record: NativeSyncNodeRecord,
  options: LocalContentEditOptions = {}) {
  if (options.bodyStorage !== 'chunked') {
    return applySyncNodesWithDbPort(db, [record], { ...options, operation: 'local_mutation' });
  }
  return applyVerifiedSyncNodesWithDbPort(db, [await adoptEditorSyncNodeRecord(db, record)],
    { enqueueSearchInvalidations: options.enqueueSearchInvalidations !== false, operation: 'local_mutation' });
}

export async function applyLocalContentEditBranch(db: DbPort, record: NativeSyncNodeRecord,
  options: LocalContentEditOptions) {
  const result = await applyEditorSyncNodeRecord(db, record, options);
  if (result.blockedIds.length || result.tombstoneBlockedIds.length) throw new Error('content_edit_blocked');
  if (!result.conflictNodes.length) return;
  if (record.snapshot.kind !== 'topic') throw new Error('content_edit_conflict_requires_topic');
  if (options.bodyStorage !== 'chunked') {
    await resolveTopicConflict(db, result.conflictNodes as NativeSyncNodeRecord[]);
    return;
  }
  const current = await loadCurrentVerifiedSyncNode(db, record.object_id);
  if (!current) throw new Error('content_edit_current_version_unavailable');
  const incoming = await adoptEditorSyncNodeRecord(db, record);
  const resolved = await resolveVerifiedTopicConflict(db, current, [incoming], new Date().toISOString());
  const applied = await applyVerifiedSyncNodesWithDbPort(db, [resolved], {
    enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: 'local_mutation'
  });
  if (!applied.appliedIds.includes(record.object_id)) throw new Error(`sync_topic_resolution_not_applied:${record.object_id}`);
  await collectNodeVersionPayloads(db, record.object_id, Number.MAX_SAFE_INTEGER, false, 'chunked');
}
