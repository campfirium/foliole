import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { isManualVirtualFolderNode } from '../../../../../lib/core/nodes/virtualNodeFilter';
import { canUseManualVirtualFolderSource } from '../../../../../lib/core/nodes/virtualNodeResults';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { iosCompanionHostName } from './iosCompanionMutationState';

export type CompanionIndexSourceChange = 'add' | 'remove';

export const companionIndexSourceHistoryTitles = {
  add: 'Add Index Sources', remove: 'Remove Index Sources'
} as const satisfies Record<CompanionIndexSourceChange, string>;

/** Adds or removes several direct sources of a manual index as one undoable action; sources already in place are skipped. */
export function changeCompanionIndexSources(indexId: string, sourceIds: readonly string[], change: CompanionIndexSourceChange) {
  // Only the folder's source list changes, so the refresh merges that one node.
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const index = await loadCompanionWorkspaceNodeFromDb(db, indexId, host);
    if (!index || index.deletedAt || !isManualVirtualFolderNode(index)) throw new Error('index_unavailable');
    const current = index.manualChildOrder ?? [];
    const requested = [...new Set(sourceIds)].filter(id => current.includes(id) !== (change === 'add'));
    if (!requested.length) return;
    if (change === 'add') {
      for (const id of requested) {
        if (!canUseManualVirtualFolderSource(await loadCompanionWorkspaceNodeFromDb(db, id, host))) throw new Error('index_source_unavailable');
      }
    }
    const next = change === 'add' ? [...current, ...requested] : current.filter(id => !requested.includes(id));
    const record = await createCompanionMetadataVersion(db, { ...index, updatedAt: new Date().toISOString() }, host);
    record.snapshot = { ...record.snapshot, manual_child_order: JSON.stringify(next) };
    record.content_hash = topicTextSnapshotHash(record.snapshot);
    await commitCompanionNodeHistoryWithDb(db, [record], companionIndexSourceHistoryTitles[change], 'local_mutation', null, [], undefined, host);
  }, { kind: 'nodes', nodeIds: [indexId], structure: true, metadata: true });
}

export function changeCompanionIndexSource(indexId: string, sourceId: string, change: CompanionIndexSourceChange) {
  return changeCompanionIndexSources(indexId, [sourceId], change);
}
