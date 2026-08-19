import { randomUUID } from 'node:crypto';

import {
  applyReviewGrade as applyReviewGradeViaDriver,
  resetNodeReviewState as resetNodeReviewStateViaDriver,
  type ApplyReviewGradeInput
} from '../../lib/core/database/reviewMutations.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export type { ApplyReviewGradeInput };

export function applyReviewGrade(input: ApplyReviewGradeInput): void {
  applyReviewGradeViaDriver(openDatabaseConnection().driver, input, {
    hostName: loadOrCreateDesktopHostName(input.reviewedAt),
    createId: randomUUID
  });
}

export function resetNodeReviewState(nodeId: string): void {
  const deletedAt = new Date().toISOString();
  resetNodeReviewStateViaDriver(openDatabaseConnection().driver, nodeId, {
    deletedAt,
    hostName: loadOrCreateDesktopHostName(deletedAt)
  });
}
