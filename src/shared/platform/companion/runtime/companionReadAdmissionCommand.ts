import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { DailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowContract';
import { scopedDailyLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowGrade';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import type { ReadIntent } from '../../../../../lib/core/flow/readIntentJournal';
import { buildSequentialReadingReadPatch } from '../../../../../lib/core/review/sequentialReading';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { companionDailyFlowPersistence } from './companionDailyFlow';
import { buildReadIntentCommand } from './companionReadIntentCommand';

// Freeze the chosen operation once, in the same durable INSERT that admits it.
export async function prepareAdmittedRead(owner: CapacitorCompanionDatabaseOwner, intent: ReadIntent, session: DailyFlowSession, preparedSnapshot?: DailyFlowLearningSnapshot, releaseSnapshot?: WorkspaceSnapshot) {
  const known = preparedSnapshot ?? companionWorkspaceSnapshots.getSnapshot();
  const snapshot = known?.nodesById[intent.nodeId] ? known : await owner.readInteractiveSnapshot(db =>
    scopedDailyLearningSnapshot(db, companionDailyFlowPersistence, [intent.nodeId]));
  const related = releaseSnapshot && buildSequentialReadingReadPatch({
    ...releaseSnapshot, readNodeId: intent.nodeId, now: intent.now, defaultPriority: intent.settings.pushQueue.defaultPriority
  });
  const prepared = buildReadIntentCommand(intent, session, snapshot, related?.changes);
  if (!prepared) throw new Error('daily_flow_learning_changed');
  return { command: prepared.command, entry: JSON.stringify(prepared.entry) };
}
