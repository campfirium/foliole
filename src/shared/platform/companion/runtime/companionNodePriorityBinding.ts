import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { subscribeCommittedCompanionWorkspace, subscribePreparedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { subscribeCompanionReadingScope } from '../reading/companionReadingScope';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export function bindCompanionNodePriorities(owner: CapacitorCompanionDatabaseOwner) {
  const committed = subscribeCommittedCompanionWorkspace((scope, db) => owner.refreshNodePriorities(scope, db));
  const prepared = subscribePreparedCompanionWorkspace(async (source, snapshot, revision) => {
    if (source !== owner) return;
    await owner.read(db => owner.readNodePriorities(db,
      getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
      owner.nodePriorityRevision === revision ? Object.values(snapshot.nodesById) : undefined));
  });
  const reset = subscribeCompanionReadingScope(() => owner.clearNodePriorities());
  return () => { committed(); prepared(); reset(); };
}
