import { randomUUID } from 'node:crypto';

import {
  applyReviewGrade as applyReviewGradeViaDriver,
  resetNodeReviewState as resetNodeReviewStateViaDriver,
  type ApplyReviewGradeInput
} from '../../lib/core/database/reviewMutations.js';
import { getReviewSchedulerVersion, loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

export type { ApplyReviewGradeInput };

export function applyReviewGrade(input: ApplyReviewGradeInput): void {
  applyReviewGradeViaDriver(openDatabaseConnection().driver, input, {
    deviceId: loadOrCreateDesktopDeviceId(input.reviewedAt),
    schedulerVersion: getReviewSchedulerVersion(loadReviewSchedulerSettings()),
    createId: randomUUID
  });
}

export function resetNodeReviewState(nodeId: string): void {
  const deletedAt = new Date().toISOString();
  resetNodeReviewStateViaDriver(openDatabaseConnection().driver, nodeId, {
    deletedAt,
    deviceId: loadOrCreateDesktopDeviceId(deletedAt)
  });
}
