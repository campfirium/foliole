import { z } from 'zod';

import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { applyReviewGrade, resetNodeReviewState } from '../../lib/core/database/reviewMutations.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard, mapGradeToRustRating } from '../../lib/core/review/types.js';
import { openDatabaseConnection } from '../database/connection.js';

const command = z.object({ nodeId: z.string(), at: z.string().datetime({ offset: true }),
  mode: z.enum(['grade', 'reset', 'undo', 'redo']), opId: z.string(), grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(3) });

/** Minimal fixture port for the production event mutations in independent processes. */
export function runReviewProjectionFixture(value: unknown) {
  const input = command.parse(value);
  const { driver } = openDatabaseConnection();
  if (input.mode === 'grade') {
    const cardBefore = readStoredReviewCard(driver, input.nodeId) ?? createInitialSchedulerCard(input.at);
    const cardAfter = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
      getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters })
      .grade({ card: cardBefore, rating: mapGradeToRustRating(input.grade), now: input.at }).card;
    applyReviewGrade(driver, {
    nodeId: input.nodeId, opId: input.opId, grade: input.grade, reviewedAt: input.at,
    schedulerVersion: 'fixture', cardBefore, cardAfter
    }, { hostName: 'fixture', createId: () => `${input.opId}-log` });
  } else if (input.mode === 'reset') resetNodeReviewState(driver, input.nodeId, { hostName: 'fixture', deletedAt: input.at });
  else saveNodeReviewStateWithSync(driver, { nodeId: input.nodeId, hostName: 'fixture', review: null,
    updatedAt: input.at, history: { mode: input.mode, targetOpId: input.opId } });
  return { state: driver.queryAll('SELECT * FROM node_review WHERE node_id = ?', [input.nodeId]),
    events: driver.queryAll('SELECT * FROM review_log WHERE node_id = ? ORDER BY op_id', [input.nodeId]) };
}
