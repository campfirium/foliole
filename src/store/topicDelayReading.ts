import { nodeReadingSummary } from '../../lib/core/nodes/nodeLearningSummary';
import { resolveTopicPostponeDaysNextAt, resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { buildReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { resolveReadingPriorityChain } from './workspaceReviewReading';

export type TopicDelayUnit = 'weeks' | 'days';
type DelayNode = Pick<Node, 'id' | 'kind' | 'reading' | 'priority' | 'parentNodeId'>;

function parseTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

type LearningNode = NonNullable<Parameters<typeof nodeReadingSummary>[0]>;

export function canDelayTopic<T extends Pick<Node, 'kind'> & LearningNode>(node: T | undefined): node is T {
  return Boolean(node && node.kind === 'topic' && nodeReadingSummary(node)?.state !== 'dismissed');
}

function buildInitialReadingProfile(nodeId: string, node: DelayNode, now: string,
  nodesById: Record<string, DelayNode | undefined>): NodeReadingProfile {
  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const intervalDurationMs = pushQueueSettings.readingInitialIntervalMs;
  const schedule = buildReadingScheduleCoreFields({
    intervalDurationMs,
    lastHandledAt: new Date(parseTime(now) - intervalDurationMs).toISOString(),
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: nodeId,
      currentReading: node.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: nodesById as Parameters<typeof resolveReadingPriorityChain>[0]['nodesById']
    }),
    range: pushQueueSettings.readingIntervalGrowthFactorRange,
    repetitionCount: 0
  });
  return { ...schedule, readingPosition: 0, state: 'active' };
}

/**
 * The reading a topic takes when postponed by a number of weeks or days. A topic never read starts from the
 * initial reading interval, so the postpone also enters it into reading. Shared by the desktop and the companion.
 */
export function buildTopicDelayReading(args: {
  nodeId: string;
  level: number;
  unit: TopicDelayUnit;
  now: string;
  nodesById: Record<string, DelayNode | undefined>;
}): NodeReadingProfile | null {
  const node = args.nodesById[args.nodeId];
  if (!canDelayTopic(node)) return null;
  const baseReading = node.reading ?? buildInitialReadingProfile(args.nodeId, node, args.now, args.nodesById);
  const nextAt = args.unit === 'days'
    ? resolveTopicPostponeDaysNextAt(args.level, args.now, baseReading)
    : resolveTopicPostponeDelayNextAt({ level: args.level, now: args.now, reading: baseReading });
  return nextAt ? { ...baseReading, nextAt, state: 'active' } : null;
}
