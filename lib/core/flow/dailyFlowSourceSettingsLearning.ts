import type { DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import type { DailyFlowSourceSettingsArgs } from './dailyFlowSourceSettings.js';

export function sourceSettingsReadingChanges(snapshot: DailyFlowLearningSnapshot, args: DailyFlowSourceSettingsArgs) {
  if (args.guardedReadings) return args.guardedReadings;
  return args.readings.map(value => {
    const node = snapshot.nodesById[value.nodeId]!;
    const before = node.reading ?? null;
    const after = before ? { ...before, state: value.after } : {
      intervalDurationMs: 0, intervalGrowthFactor: 1, lastHandledAt: args.now, nextAt: args.now,
      priority: node.priority ?? args.defaultPriority, readingPosition: 0, repetitionCount: 0, state: value.after
    };
    return { nodeId: value.nodeId, before, after };
  });
}

export function sourceSettingsReadingReceipt(snapshot: DailyFlowLearningSnapshot, args: DailyFlowSourceSettingsArgs, updatedAt: string) {
  return { updatedAt, readings: (args.guardedReadings ?? args.readings).map(value => ({ nodeId: value.nodeId,
    reading: snapshot.nodesById[value.nodeId]?.reading ?? null })) };
}
