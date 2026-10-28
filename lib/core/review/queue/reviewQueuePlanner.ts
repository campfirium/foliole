import type { WorkspaceNodeSnapshot } from '../../database/workspaceSnapshotHelpers.js';
import { createWorkspaceNodePriorityIndex } from '../../nodes/workspaceNodePriorityIndex.js';
import type { ReviewItemNodeLike } from '../reviewItemKind.js';
import { assembleReadingPushQueue } from '../unifiedPushQueueAssembler.js';
import { type PushQueuePriority, type UnifiedPushQueueRules } from '../unifiedPushQueueRules.js';

import { collectReviewQueueCandidates } from './reviewQueuePlannerCandidates.js';
import { resolveFsrsQueueNodeIds } from './reviewQueuePlannerFsrs.js';
import { createSeededRandom } from './reviewQueuePlannerHelpers.js';
import { resolveModeQueueNodeIds } from './reviewQueuePlannerMode.js';
import { resolveReviewQueueNodePathNodeIds, resolveReviewQueueReadingAvailableAt, resolveReviewQueueReadingDueAt } from './reviewQueuePlannerReadingPaths.js';
import type { ReviewSessionMode } from './reviewQueueTypes.js';

export interface ReviewQueuePlan {
  fsrsCandidateCount: number;
  fsrsQueueNodeIds: string[];
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  readingQueueNodeIds: string[];
}

export type ReviewQueueNode = ReviewItemNodeLike & Pick<WorkspaceNodeSnapshot, 'createdAt' | 'deletedAt' | 'hasContent' | 'id' | 'parentNodeId' | 'priority' | 'shelvedAt'> & Partial<Pick<WorkspaceNodeSnapshot, 'content' | 'reading'>>;

function resolveReadingQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  priorities: ReadonlyMap<string, PushQueuePriority>;
  readingDayStartsAtHour: number;
  disperseMaterial: boolean;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => {
      const nextAt = resolveReviewQueueReadingDueAt(node);
      return {
        dueAt: resolveReviewQueueReadingAvailableAt(node, args.readingDayStartsAtHour),
        id: node.id,
        intervalDurationMs: node.reading?.intervalDurationMs,
        nextAt,
        pathNodeIds: resolveReviewQueueNodePathNodeIds(node, args.nodesById),
        priority: args.priorities.get(node.id)!,
      };
    }),
    {
      ...(args.disperseMaterial
        ? {
            materialDispersion: {
              now: args.now,
              readingInitialIntervalMs: args.pushQueueRules.readingInitialIntervalMs
            }
          }
        : {}),
      priorityRatio: args.pushQueueRules.priorityRatio,
      random
    }
  ).map((entry) => entry.id);
}

export interface ReviewQueuePlanInput {
  candidateNow?: string;
  includeScheduled?: boolean;
  limit?: number;
  mode?: ReviewSessionMode;
  newDayStartsAtHour: number;
  readingDayStartsAtHour: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}

type Candidates = ReturnType<typeof collectReviewQueueCandidates>;

function collectCandidates(args: ReviewQueuePlanInput) {
  const includeScheduled = args.includeScheduled ?? false;
  const newDayStartsAtHour = args.newDayStartsAtHour;
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return collectReviewQueueCandidates({
    includeScheduled,
    readingDayStartsAtHour: args.readingDayStartsAtHour,
    newDayStartsAtHour,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.candidateNow ?? args.now,
    trashedNodeIds
  });
}

function buildOrderedQueues(args: ReviewQueuePlanInput, { fsrsCandidates, readingCandidates }: Candidates,
  priorities: ReadonlyMap<string, PushQueuePriority>) {
  const includeScheduled = args.includeScheduled ?? false;
  const pushQueueRules = args.pushQueueRules;
  const fsrsQueueNodeIds = resolveFsrsQueueNodeIds({
    candidates: fsrsCandidates,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules,
    priorities
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    priorities,
    readingDayStartsAtHour: args.readingDayStartsAtHour,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules
  });
  return { fsrsQueueNodeIds, readingQueueNodeIds };
}

function assemblePlan(args: ReviewQueuePlanInput,
  { fsrsQueueNodeIds, readingQueueNodeIds }: ReturnType<typeof buildOrderedQueues>): ReviewQueuePlan {
  const queueNodeIds = resolveModeQueueNodeIds({
    fsrsQueueNodeIds,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    mode: args.mode ?? 'recommended',
    pushQueueRules: args.pushQueueRules,
    readingQueueNodeIds
  });

  return {
    fsrsCandidateCount: fsrsQueueNodeIds.length,
    fsrsQueueNodeIds,
    overflowCount: fsrsQueueNodeIds.length + readingQueueNodeIds.length - queueNodeIds.length,
    queueNodeIds,
    readingCandidateCount: readingQueueNodeIds.length,
    readingQueueNodeIds
  };
}

function sameCandidates(left: Candidates, right: Candidates) {
  return left.fsrsCandidates.length === right.fsrsCandidates.length
    && left.readingCandidates.length === right.readingCandidates.length
    && left.fsrsCandidates.every((node, index) => node === right.fsrsCandidates[index])
    && left.readingCandidates.every((node, index) => node === right.readingCandidates[index]);
}

// Owns only one construction's immutable input; callers release it after producing the daily list.
export function createReviewQueuePlanner(input: ReviewQueuePlanInput) {
  const priorities = createWorkspaceNodePriorityIndex(input.nodesById, input.pushQueueRules.defaultPriority);
  let previous: { candidates: Candidates; ordered: ReturnType<typeof buildOrderedQueues> } | undefined;
  return (options: Pick<ReviewQueuePlanInput, 'candidateNow' | 'mode' | 'limit'> = {}): ReviewQueuePlan => {
    const args = { ...input, ...options };
    const candidates = collectCandidates(args);
    const ordered = previous && sameCandidates(previous.candidates, candidates)
      ? previous.ordered : buildOrderedQueues(args, candidates, priorities);
    previous = { candidates, ordered };
    return assemblePlan(args, ordered);
  };
}

export function buildReviewQueuePlan(args: ReviewQueuePlanInput): ReviewQueuePlan {
  return createReviewQueuePlanner(args)();
}
