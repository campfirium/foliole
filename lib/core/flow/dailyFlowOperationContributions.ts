import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { effectiveFlowActions, flowProgressDelta } from './dailyFlowSyncMerge.js';

export type ActionGroups = Map<string, DailyFlowSyncFact[]>;
export function groupActions(facts: DailyFlowSyncFact[]) {
  const groups: ActionGroups = new Map();
  for (const fact of effectiveFlowActions(facts)) {
    if (!fact.nodeId || (fact.targetOpId && fact.kind !== 'advance')) continue;
    const list = groups.get(fact.nodeId) ?? [];
    list.push(fact); groups.set(fact.nodeId, list);
  }
  return groups;
}

export function localFlowTotals(facts: DailyFlowSyncFact[], groups: ActionGroups, baseline: Map<string, CycleRow | null>) {
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  let readingElapsedMs = 0; let reviewElapsedMs = 0; let readTopicCount = 0; let reviewedItemCount = 0;
  for (const fact of effectiveFlowActions(facts)) {
    if (fact.targetOpId && fact.kind !== 'advance' && byId.has(fact.targetOpId)) continue;
    const delta = fact.statsDelta ?? flowProgressDelta(byId.get(fact.parentId ?? '')?.session, fact.session);
    readingElapsedMs += delta.readingElapsedMs; reviewElapsedMs += delta.reviewElapsedMs;
    if ((fact.kind === 'undo' || fact.kind === 'redo') && (!fact.targetOpId || !byId.has(fact.targetOpId))) {
      readTopicCount += delta.readTopicCount; reviewedItemCount += delta.reviewedItemCount;
    }
  }
  for (const [id, actions] of groups) {
    if (baseline.get(id)?.handled) continue;
    const counted = actions.find(fact => (fact.statsDelta?.readTopicCount ?? 0) > 0 || (fact.statsDelta?.reviewedItemCount ?? 0) > 0) ?? actions[0]!;
    if (counted.action === 'grade') reviewedItemCount += 1;
    else if (counted.action && counted.action !== 'navigate' && counted.action !== 'history') readTopicCount += 1;
  }
  return { readingElapsedMs, reviewElapsedMs, readTopicCount, reviewedItemCount };
}
