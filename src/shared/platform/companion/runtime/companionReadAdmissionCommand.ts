import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { DailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowContract';
import { scopedDailyLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowGrade';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import type { ReadIntent } from '../../../../../lib/core/flow/readIntentJournal';
import { buildSequentialReadingReadPatch, createReadingWithState } from '../../../../../lib/core/review/sequentialReading';
import { findNextSequentialReadingTopic } from '../../../../../lib/core/review/sequentialReadingNextTopic';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { companionDailyFlowPersistence } from './companionDailyFlow';
import { buildReadIntentCommand } from './companionReadIntentCommand';

// Freeze the chosen operation once, in the same durable INSERT that admits it.
export async function prepareAdmittedRead(owner: CapacitorCompanionDatabaseOwner, intent: ReadIntent, session: DailyFlowSession, preparedSnapshot?: DailyFlowLearningSnapshot, releaseSnapshot?: WorkspaceSnapshot, nextTopicId?: string) {
  const known = preparedSnapshot ?? companionWorkspaceSnapshots.getSnapshot();
  const snapshot = known?.nodesById[intent.nodeId] ? known : await owner.readInteractiveSnapshot(db =>
    scopedDailyLearningSnapshot(db, companionDailyFlowPersistence, [intent.nodeId]));
  const related = !nextTopicId && releaseSnapshot && buildSequentialReadingReadPatch({
    ...releaseSnapshot, readNodeId: intent.nodeId, now: intent.now, defaultPriority: intent.settings.pushQueue.defaultPriority
  });
  const next = nextTopicId && releaseSnapshot?.nodesById[nextTopicId];
  if (nextTopicId && (!next || !releaseSnapshot ||
    findNextSequentialReadingTopic({ ...releaseSnapshot, currentNodeId: intent.nodeId }) !== nextTopicId)) {
    throw new Error('The next topic is no longer available.');
  }
  const changes = next ? [{ nodeId: next.id, beforeReading: next.reading ?? null,
    afterReading: { ...createReadingWithState({ node: next, defaultPriority: intent.settings.pushQueue.defaultPriority,
      now: intent.now, state: 'active' }), nextAt: next.reading && next.reading.nextAt < intent.now ? next.reading.nextAt : intent.now } }]
    : related ? related.changes : [];
  const prepared = buildReadIntentCommand(intent, session, snapshot, changes);
  if (prepared && nextTopicId) prepared.command.nextReadingNodeId = nextTopicId;
  if (!prepared) throw new Error('daily_flow_learning_changed');
  return { command: prepared.command, entry: JSON.stringify(prepared.entry) };
}
