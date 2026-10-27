import { hasDeletedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowSnapshot } from './dailyFlowContract.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';

export function sameLearningProfile(left: unknown, right: unknown) {
  if (left == null || right == null) return left == null && right == null;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);
}

export function assertCycleLearningFacts(snapshot: DailyFlowSnapshot, args: DailyFlowCommitArgs) {
  const changes = args.grade ? [{ nodeId: args.grade.nodeId, before: args.grade.before, field: 'review' as const }]
    : args.reviewHistory ? [{ nodeId: args.reviewHistory.nodeId, before: args.reviewHistory.before, field: 'review' as const }]
    : (args.readings ?? []).map(value => ({ ...value, field: 'reading' as const }));
  for (const value of changes) {
    const node = snapshot.nodesById[value.nodeId];
    if (!node || snapshot.trashedNodeIds.includes(value.nodeId) || hasDeletedAncestor(node, snapshot.nodesById)
      || !sameLearningProfile(node[value.field], value.before)) throw new Error('daily_flow_learning_changed');
  }
}

export async function persistCycleLearning(db: DbPort, args: DailyFlowCommitArgs,
  persistence: DailyFlowPersistence): Promise<{ card?: SchedulerCard | null }> {
  if (args.grade) return { card: await persistence.grade(db, args.grade, args.opId) };
  if (args.reviewHistory) return { card: await persistence.reviewHistory(db, args.reviewHistory, args.now) };
  for (const value of args.readings ?? []) if (!sameLearningProfile(value.before, value.after)) await persistence.reading(db, value, args.now);
  return {};
}
