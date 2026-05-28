import { default_w, forgetting_curve } from 'ts-fsrs';

import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  type ResolvedNodeSetting
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../../features/review/model/reviewItemKind';
import { getPriorityWeight, normalizeRegularPushQueuePriority } from '../../features/review/model/unifiedPushQueueRules';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { resolveReviewQueueReadingDueAt } from '../../store/reviewQueuePlannerReadingPaths';

export interface SchedulingPanelData {
  desiredRetention: ResolvedNodeSetting<number>;
  initialReadingIntervalMs: number;
  kind: 'item' | 'topic' | 'unsupported';
  nextReadingAt: string;
  node: Node;
  priority: ResolvedNodeSetting<number>;
  priorityRatio: number;
  retrievability: number | null;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'None';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDurationDays(value: number) {
  return `${formatNumber(value)} d`;
}

export function formatDurationMs(value: number) {
  const hours = value / (60 * 60 * 1000);
  if (hours < 24) return `${formatNumber(hours)} h`;
  return `${formatNumber(hours / 24)} d`;
}

export function formatPriority(value: number) {
  return `P${value}`;
}

export function formatPriorityWeight(priority: number, priorityRatio: number) {
  return formatNumber(getPriorityWeight(normalizeRegularPushQueuePriority(priority, 1), priorityRatio));
}

function getFsrsRetrievability(review: Node['review'], now: number) {
  if (!review?.lastReviewAt || review.stability <= 0) return null;
  const lastReviewMs = Date.parse(review.lastReviewAt);
  if (Number.isNaN(lastReviewMs)) return null;
  const elapsedDays = Math.max((now - lastReviewMs) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(default_w, elapsedDays, review.stability);
  return Number.isFinite(retrievability) ? retrievability : null;
}

function resolveKind(node: Node) {
  if (isReadingReviewItemNode(node)) return 'topic';
  if (isFsrsReviewItemNode(node)) return 'item';
  return 'unsupported';
}

export function resolveSchedulingPanelData(args: {
  activeNodeId: string;
  nodesById: Record<string, Node>;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}): SchedulingPanelData | null {
  const node = args.nodesById[args.activeNodeId];
  if (!node) return null;
  const now = Date.now();
  return {
    desiredRetention: resolveNodeDesiredRetentionSetting(
      args.activeNodeId,
      args.nodesById,
      args.reviewSchedulerSettings.desiredRetention
    ),
    initialReadingIntervalMs: args.reviewSchedulerSettings.pushQueue.readingInitialIntervalMs,
    kind: resolveKind(node),
    nextReadingAt: resolveReviewQueueReadingDueAt(node),
    node,
    priority: resolveNodePrioritySetting(
      args.activeNodeId,
      args.nodesById,
      args.reviewSchedulerSettings.pushQueue.defaultPriority
    ),
    priorityRatio: args.reviewSchedulerSettings.pushQueue.priorityRatio,
    retrievability: getFsrsRetrievability(node.review, now)
  };
}
