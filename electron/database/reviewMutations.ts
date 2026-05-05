import { randomUUID } from 'node:crypto';

import {
  applyReviewGrade as applyReviewGradeViaDriver,
  resetNodeReviewState as resetNodeReviewStateViaDriver,
  type ApplyReviewGradeInput
} from '../../lib/core/database/reviewMutations.js';
import { getReviewSchedulerVersion, loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { openDatabaseConnection } from './connection.js';

const REVIEW_DEVICE_ID = 'desktop-local';

export type { ApplyReviewGradeInput };

export function applyReviewGrade(input: ApplyReviewGradeInput): void {
  applyReviewGradeViaDriver(openDatabaseConnection().driver, input, {
    deviceId: REVIEW_DEVICE_ID,
    schedulerVersion: getReviewSchedulerVersion(loadReviewSchedulerSettings()),
    createId: randomUUID
  });
}

export function resetNodeReviewState(nodeId: string): void {
  resetNodeReviewStateViaDriver(openDatabaseConnection().driver, nodeId);
}
