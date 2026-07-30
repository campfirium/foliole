import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.ts';
import { advanceReadingScheduleCoreFields } from '../../src/features/review/model/unifiedPushQueueRules.ts';

import type {
  ExpectedAction, ReadingAuditState, ReviewAuditSession, ReviewAuditState
} from './android-review-audit-types.ts';

export interface TransitionIssue { code: string; error: string; name: string }

function outgoingAdvanced(before: ReadingAuditState['outgoing'], after: ReadingAuditState['outgoing']) {
  return after.recordPresent && (
    (after.stateSeq ?? -1) > (before.stateSeq ?? -1)
    || after.updatedAt !== before.updatedAt
    || (!before.recordPresent && after.syncDirty === 1)
  );
}

function readingExpectedState(
  before: ReadingAuditState,
  after: ReadingAuditState,
  action: Extract<ExpectedAction['action'], 'read' | 'later'>,
  settings: ReviewSchedulerSettings
) {
  if (!after.lastHandledAt) return null;
  return advanceReadingScheduleCoreFields({
    ...(action === 'later' ? { growthFactorExponent: 0.5 } : {}),
    initialIntervalMs: settings.pushQueue.readingInitialIntervalMs,
    lastHandledAt: after.lastHandledAt,
    minimumIntervalMs: settings.pushQueue.readingInitialIntervalMs,
    previousIntervalDurationMs: before.intervalDurationMs,
    previousRepetitionCount: before.repetitionCount,
    priorityChain: [before.priority],
    range: settings.pushQueue.readingIntervalGrowthFactorRange
  });
}

function validateReading(
  before: ReadingAuditState,
  after: ReadingAuditState,
  expected: ExpectedAction,
  settings: ReviewSchedulerSettings
) {
  const common = before.nodeId === after.nodeId && after.lastHandledAt !== before.lastHandledAt
    && outgoingAdvanced(before.outgoing, after.outgoing);
  if (expected.action === 'dismiss') {
    return common && after.state === 'dismissed'
      && after.repetitionCount === before.repetitionCount && after.nextAt === before.nextAt;
  }
  if (expected.action !== 'read' && expected.action !== 'later') return false;
  const next = readingExpectedState(before, after, expected.action, settings);
  return common && after.state === before.state && Boolean(next)
    && after.intervalDurationMs === next?.intervalDurationMs
    && after.repetitionCount === next?.repetitionCount && after.nextAt === next?.nextAt;
}

function fsrsItems(state: ReviewAuditState) {
  return state.fsrsItems?.length ? state.fsrsItems : [state.fsrs];
}

function validateFsrs(before: ReviewAuditState, current: ReviewAuditState, expected: ExpectedAction, index: number) {
  const previous = fsrsItems(before)[index];
  const after = fsrsItems(current)[index];
  return expected.nodeId === after?.nodeId && previous?.nodeId === after.nodeId
    && after.reviewLogCount === previous.reviewLogCount + 1
    && after.reps === previous.reps + 1 && after.due !== previous.due
    && after.lastReviewAt !== previous.lastReviewAt
    && after.latestReviewLog?.schedulerVersion === current.schedulerVersion
    && outgoingAdvanced(previous.outgoing, after.outgoing);
}

export function validateCaptureTransition(
  session: ReviewAuditSession,
  current: ReviewAuditState,
  settings: ReviewSchedulerSettings
): TransitionIssue[] {
  const issues: TransitionIssue[] = [];
  const before = session.baseline;
  session.expectedActions.filter(({ itemKind }) => itemKind === 'fsrs').forEach((expected, index) => {
    if (!validateFsrs(before, current, expected, index)) {
      issues.push({
        code: 'review_fsrs_transition_missing',
        error: 'FSRS grade did not produce the expected bound transition',
        name: `transition.fsrs[${index}]`
      });
    }
  });
  session.expectedActions.filter(({ itemKind }) => itemKind === 'reading').forEach((expected, index) => {
    const previous = before.reading[index];
    const after = current.reading[index];
    if (!previous || !after || expected.nodeId !== previous.nodeId || expected.nodeId !== after.nodeId
      || !validateReading(previous, after, expected, settings)) {
      issues.push({
        code: `review_reading_${expected.action}_transition_missing`,
        error: `Reading ${expected.action} did not produce the expected bound transition`,
        name: `transition.reading[${index}]`
      });
    }
  });
  return issues;
}

function persistenceView(state: ReviewAuditState) {
  return {
    fsrs: {
      due: state.fsrs.due, lapses: state.fsrs.lapses, lastReviewAt: state.fsrs.lastReviewAt,
      latestReviewLog: state.fsrs.latestReviewLog, nodeId: state.fsrs.nodeId,
      reps: state.fsrs.reps, reviewLogCount: state.fsrs.reviewLogCount, state: state.fsrs.state
    },
    fsrsItems: fsrsItems(state).map((item) => ({
      due: item.due, lapses: item.lapses, lastReviewAt: item.lastReviewAt,
      latestReviewLog: item.latestReviewLog, nodeId: item.nodeId,
      reps: item.reps, reviewLogCount: item.reviewLogCount, state: item.state
    })),
    reading: state.reading.map((reading) => ({
      intervalDurationMs: reading.intervalDurationMs,
      intervalGrowthFactor: reading.intervalGrowthFactor,
      itemKind: reading.itemKind,
      lastHandledAt: reading.lastHandledAt,
      nextAt: reading.nextAt,
      nodeId: reading.nodeId,
      priority: reading.priority,
      repetitionCount: reading.repetitionCount,
      state: reading.state
    })),
    schedulerVersion: state.schedulerVersion
  };
}

export function validateRestartPersistence(session: ReviewAuditSession, current: ReviewAuditState): TransitionIssue[] {
  if (!session.captured) return [{
    code: 'review_capture_state_missing', error: 'capture must complete before restart audit', name: 'transition.restart'
  }];
  return JSON.stringify(persistenceView(session.captured)) === JSON.stringify(persistenceView(current)) ? [] : [{
    code: 'review_restart_rollback', error: 'Review state changed or rolled back after restart', name: 'transition.restart'
  }];
}
