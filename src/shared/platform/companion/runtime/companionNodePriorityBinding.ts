import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { subscribeCommittedCompanionWorkspace, subscribePreparedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { subscribeCompanionReadingScope } from '../reading/companionReadingScope';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export function bindCompanionNodePriorities(owner: CapacitorCompanionDatabaseOwner) {
  const committed = subscribeCommittedCompanionWorkspace((scope, db) => owner.refreshNodePriorities(scope, db));
  const prepared = subscribePreparedCompanionWorkspace(async (source, snapshot, revision, orderedNodeIds) => {
    if (source !== owner) return;
    await owner.read(async db => {
      const current = owner.nodePriorityRevision === revision;
      await owner.readNodePriorities(db, getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        current ? Object.values(snapshot.nodesById).map(node => ({
          id: node.id, parentNodeId: node.parentNodeId, priority: node.priority ?? null,
          createdAt: node.createdAt, deletedAt: node.deletedAt ?? null, kind: node.kind, shelvedAt: node.shelvedAt ?? null,
          hasContent: node.bodyBlobHash != null || node.hasContent === true, hasReveal: node.hasReveal === true
        })) : undefined);
      await owner.readNodeOrder(db, current ? orderedNodeIds : undefined);
    });
  });
  const reset = subscribeCompanionReadingScope(() => owner.clearNodePriorities());
  return () => { committed(); prepared(); reset(); };
}
