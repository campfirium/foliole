import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.ts';
import { advanceReadingScheduleCoreFields } from '../../src/features/review/model/unifiedPushQueueRules.ts';

import type {
  AcceptanceSession, ExpectedAction, ReadingAuditState, ReviewAuditState
} from './windows-android-lab-review-audit-types.ts';

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

export function validateCaptureTransition(
  session: AcceptanceSession,
  current: ReviewAuditState,
  settings: ReviewSchedulerSettings
): TransitionIssue[] {
  const issues: TransitionIssue[] = [];
  const before = session.baseline;
  const expectedFsrs = session.expectedActions.find(({ itemKind }) => itemKind === 'fsrs');
  const fsrs = current.fsrs;
  const fsrsPassed = expectedFsrs?.nodeId === fsrs.nodeId && before.fsrs.nodeId === fsrs.nodeId
    && fsrs.reviewLogCount === before.fsrs.reviewLogCount + 1
    && fsrs.reps === before.fsrs.reps + 1 && fsrs.due !== before.fsrs.due
    && fsrs.lastReviewAt !== before.fsrs.lastReviewAt
    && fsrs.latestReviewLog?.schedulerVersion === current.schedulerVersion
    && outgoingAdvanced(before.fsrs.outgoing, fsrs.outgoing);
  if (!fsrsPassed) issues.push({
    code: 'review_fsrs_transition_missing', error: 'FSRS grade did not produce the expected bound transition', name: 'transition.fsrs'
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

export function validateRestartPersistence(session: AcceptanceSession, current: ReviewAuditState): TransitionIssue[] {
  if (!session.captured) return [{
    code: 'review_capture_state_missing', error: 'capture must complete before restart audit', name: 'transition.restart'
  }];
  return JSON.stringify(persistenceView(session.captured)) === JSON.stringify(persistenceView(current)) ? [] : [{
    code: 'review_restart_rollback', error: 'Review state changed or rolled back after restart', name: 'transition.restart'
  }];
}
