import type { WorkspaceNodeSnapshot } from '../../database/workspaceSnapshotHelpers.js';
import { createWorkspaceNodePaths, type WorkspaceNodePaths } from '../../nodes/workspaceNodePaths.js';
import { createWorkspaceNodePriorityIndex } from '../../nodes/workspaceNodePriorityIndex.js';
import type { ReviewItemNodeLike } from '../reviewItemKind.js';
import { assembleReadingPushQueue } from '../unifiedPushQueueAssembler.js';
import { type PushQueuePriority, type UnifiedPushQueueRules } from '../unifiedPushQueueRules.js';

import type { ReviewQueueDayWindow } from './reviewQueueDayWindow.js';
import { collectReviewQueueCandidates } from './reviewQueuePlannerCandidates.js';
import { resolveFsrsQueueNodeIds } from './reviewQueuePlannerFsrs.js';
import { createSeededRandom } from './reviewQueuePlannerHelpers.js';
import { resolveModeQueueNodeIds } from './reviewQueuePlannerMode.js';
import { resolveReviewQueueReadingDueAt } from './reviewQueuePlannerReadingPaths.js';
import { createReviewQueueTimeInput, type ReviewQueueTimeInput } from './reviewQueueTimeInput.js';
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
  paths: WorkspaceNodePaths;
  time: ReviewQueueTimeInput;
  disperseMaterial: boolean;
  nodeOrder: string[];
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => {
      const nextAt = resolveReviewQueueReadingDueAt(node);
      return {
        dueAt: args.time.readingAvailableAt(node),
        id: node.id,
        intervalDurationMs: node.reading?.intervalDurationMs,
        nextAt,
        pathNodeIds: args.paths.get(node.id)!,
        priority: args.priorities.get(node.id)!,
      };
    }),
    {
      ...(args.disperseMaterial
        ? {
            materialDispersion: {
              now: args.now,
              timestamp: args.time.timestamp,
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
  dayWindow?: ReviewQueueDayWindow;
  candidateNow?: string;
  includeScheduled?: boolean;
  limit?: number;
  mode?: ReviewSessionMode;
  newDayStartsAtHour: number;
  readingDayStartsAtHour: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  nodePriorities?: ReadonlyMap<string, PushQueuePriority>;
  nodePaths?: WorkspaceNodePaths;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}

type Candidates = ReturnType<typeof collectReviewQueueCandidates>;

function collectCandidates(args: ReviewQueuePlanInput, time: ReviewQueueTimeInput) {
  const includeScheduled = args.includeScheduled ?? false;
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return collectReviewQueueCandidates({
    includeScheduled,
    time,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.candidateNow ?? args.now,
    trashedNodeIds
  });
}

function buildOrderedQueues(args: ReviewQueuePlanInput, { fsrsCandidates, readingCandidates }: Candidates,
  priorities: ReadonlyMap<string, PushQueuePriority>, paths: WorkspaceNodePaths, time: ReviewQueueTimeInput) {
  const includeScheduled = args.includeScheduled ?? false;
  const pushQueueRules = args.pushQueueRules;
  const fsrsQueueNodeIds = resolveFsrsQueueNodeIds({
    candidates: fsrsCandidates,
    paths,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    now: args.now,
    time,
    pushQueueRules,
    priorities
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    paths,
    priorities,
    time,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
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

function createPlanningContext(input: ReviewQueuePlanInput) {
  const priorities = input.nodePriorities ?? createWorkspaceNodePriorityIndex(input.nodesById, input.pushQueueRules.defaultPriority);
  const paths = input.nodePaths ?? createWorkspaceNodePaths(Object.values(input.nodesById).filter((node): node is ReviewQueueNode => Boolean(node)));
  const time = createReviewQueueTimeInput(input.readingDayStartsAtHour, input.newDayStartsAtHour, input.dayWindow);
  return { priorities, paths, time };
}

// Owns only one construction's immutable input; callers release it after producing the daily list.
export function createReviewQueuePlanner(input: ReviewQueuePlanInput) {
  const { priorities, paths, time } = createPlanningContext(input);
  let previous: { candidates: Candidates; ordered: ReturnType<typeof buildOrderedQueues> } | undefined;
  return (options: Pick<ReviewQueuePlanInput, 'candidateNow' | 'mode' | 'limit'> = {}): ReviewQueuePlan => {
    const args = { ...input, ...options };
    const candidates = collectCandidates(args, time);
    const ordered = previous && sameCandidates(previous.candidates, candidates)
      ? previous.ordered : buildOrderedQueues(args, candidates, priorities, paths, time);
    previous = { candidates, ordered };
    return assemblePlan(args, ordered);
  };
}

export function buildReviewQueuePlan(args: ReviewQueuePlanInput): ReviewQueuePlan {
  return createReviewQueuePlanner(args)();
}

// Day end controls membership; current eligibility projects the already ordered kind queues.
export function prepareReviewQueueDayCandidates(input: ReviewQueuePlanInput, dayEnd: string) {
  const time = createReviewQueueTimeInput(input.readingDayStartsAtHour, input.newDayStartsAtHour, input.dayWindow);
  return { time, candidates: collectCandidates({ ...input, candidateNow: dayEnd }, time) };
}

export function buildReviewQueueDayPlan(input: ReviewQueuePlanInput, dayEnd: string,
  prepared = prepareReviewQueueDayCandidates(input, dayEnd)) {
  const { priorities, paths } = createPlanningContext(input);
  const { time, candidates } = prepared;
  const ordered = buildOrderedQueues(input, candidates, priorities, paths, time);
  const nowMs = time.timestamp(input.now);
  const ready = new Set([
    ...candidates.fsrsCandidates.filter(node => time.reviewDueAt(node, input.now) <= nowMs),
    ...candidates.readingCandidates.filter(node => time.timestamp(time.readingAvailableAt(node)) <= nowMs)
  ].map(node => node.id));
  const current = {
    fsrsQueueNodeIds: ordered.fsrsQueueNodeIds.filter(id => ready.has(id)),
    readingQueueNodeIds: ordered.readingQueueNodeIds.filter(id => ready.has(id))
  };
  return { initial: assemblePlan(input, current), fullDay: assemblePlan({ ...input, mode: 'recommended' }, ordered) };
}
