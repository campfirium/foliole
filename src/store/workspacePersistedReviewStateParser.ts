import { parsePersistedReviewSessionModePreference } from './workspaceReviewSessionModePreference';
import type { ReviewSessionState, WorkspacePersistedState } from './workspaceStore';

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseReviewSession(value: unknown): ReviewSessionState | undefined {
  if (!isPlainRecord(value)) return undefined;
  if (
    (value.currentNodeId !== null && typeof value.currentNodeId !== 'string') ||
    typeof value.isAnswerRevealed !== 'boolean' ||
    !Array.isArray(value.queueNodeIds) ||
    !value.queueNodeIds.every((item) => typeof item === 'string') ||
    typeof value.totalNodeCount !== 'number'
  ) return undefined;
  const nextReviewDueAt =
    typeof value.nextReviewDueAt === 'string' && Number.isFinite(Date.parse(value.nextReviewDueAt))
      ? value.nextReviewDueAt
      : value.nextReviewDueAt === null ? null : undefined;
  return {
    ...(typeof value.completedAt === 'string' || value.completedAt === null ? { completedAt: value.completedAt } : {}),
    ...(typeof value.continueNodeId === 'string' || value.continueNodeId === null ? { continueNodeId: value.continueNodeId } : {}),
    ...(typeof value.currentItemStartedAt === 'string' || value.currentItemStartedAt === null ? { currentItemStartedAt: value.currentItemStartedAt } : {}),
    currentNodeId: value.currentNodeId,
    isAnswerRevealed: value.isAnswerRevealed,
    queueNodeIds: value.queueNodeIds as string[],
    ...(typeof value.readingElapsedMs === 'number' ? { readingElapsedMs: value.readingElapsedMs } : {}),
    ...(typeof value.readTopicCount === 'number' ? { readTopicCount: value.readTopicCount } : {}),
    ...(typeof value.reviewElapsedMs === 'number' ? { reviewElapsedMs: value.reviewElapsedMs } : {}),
    ...(typeof value.reviewedItemCount === 'number' ? { reviewedItemCount: value.reviewedItemCount } : {}),
    ...(nextReviewDueAt !== undefined ? { nextReviewDueAt } : {}),
    ...(typeof value.sessionStartedAt === 'string' || value.sessionStartedAt === null ? { sessionStartedAt: value.sessionStartedAt } : {}),
    totalNodeCount: value.totalNodeCount
  };
}

export function parsePersistedReviewState(value: UnknownRecord): Partial<WorkspacePersistedState> {
  const reviewSession = parseReviewSession(value.reviewSession);
  return {
    ...(reviewSession ? { reviewSession } : {}),
    ...parsePersistedReviewSessionModePreference(
      value.reviewSessionMode,
      value.reviewSessionModeExpiresAt
    )
  };
}
