import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { saveDailyFlowSourceSettings } from '../../../../../lib/core/flow/dailyFlowSourceSettings';
import { collectSequentialDerivedTopicIds } from '../../../../../lib/core/review/sequentialReadingSourceOrder';
import { planSequentialReadingSourceStates } from '../../../../../lib/core/review/sequentialReadingSourceStates';
import { publishCompanionHighValueMutation } from '../sync/mutation/companionSyncMutationRevision';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { runCompanionHistoryMutation } from './companionFlowHistory';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export async function setCompanionEpubReadingMode(nodeId: string, enabled: boolean,
  owner: ReturnType<typeof getIosCompanionDatabaseOwner>, signal?: AbortSignal) {
  let committed = false;
  try { return await runCompanionHistoryMutation(async db => {
    signal?.throwIfAborted();
    if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    if (!snapshot) throw new Error('Book is unavailable.');
    const host = await iosCompanionHostName(db);
    const ids = [nodeId, ...collectSequentialDerivedTopicIds({ ...snapshot, sourceNodeId: nodeId })];
    for (const id of ids) {
      const node = await loadCompanionWorkspaceNodeFromDb(db, id, host);
      if (!node || node.deletedAt) throw new Error('Book is unavailable.');
      snapshot.nodesById[id] = node;
    }
    const now = new Date().toISOString();
    const plan = planSequentialReadingSourceStates({ ...snapshot, sourceNodeId: nodeId, enabled });
    if (!plan) throw new Error('Book reading mode is unavailable.');
    const source = snapshot.nodesById[nodeId]!;
    if (source.sequentialReadingEnabled === enabled && !plan.changes.length) return nodeId;
    const before = { shelvedAt: source.shelvedAt ?? null, manualChildOrder: source.manualChildOrder ?? null,
      sequentialReadingEnabled: source.sequentialReadingEnabled ?? null };
    const settings = companionDailyFlowSettings();
    await saveDailyFlowSourceSettings(db, { scope: settings.scope, sourceNodeId: nodeId, now, before,
      after: { ...before, sequentialReadingEnabled: enabled }, readings: plan.changes,
      defaultPriority: settings.pushQueue.defaultPriority }, companionDailyFlowPersistence, host, settings.scope);
    signal?.throwIfAborted();
    return nodeId;
  }, { kind: 'full' }, () => { committed = true; });
  } catch (error) {
    if (!committed) throw error;
    if (owner === getIosCompanionDatabaseOwner()) publishCompanionHighValueMutation({ kind: 'full' });
    return nodeId;
  }
}
