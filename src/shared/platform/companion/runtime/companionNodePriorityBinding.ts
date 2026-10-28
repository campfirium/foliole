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
        current ? Object.values(snapshot.nodesById) : undefined);
      await owner.readNodeOrder(db, current ? orderedNodeIds : undefined);
    });
  });
  const reset = subscribeCompanionReadingScope(() => owner.clearNodePriorities());
  return () => { committed(); prepared(); reset(); };
}
