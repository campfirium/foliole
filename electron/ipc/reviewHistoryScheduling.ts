import { readNodeReviewParameters } from '../../lib/core/database/reviewProjection.js';
import { previewReviewAt } from '../../lib/core/review/recomputeReview.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import type { NativeReviewGradeArgs, NativeReviewPreviewArgs, NativeReviewPreviewResult } from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';

/** Preview at the candidate's event time; the write receipt owns the final full-history projection. */
function loadReviewHistory(request: NativeReviewPreviewArgs['request']) {
  if (!request.nodeId) return null;
  const driver = openDatabaseConnection().driver;
  const settings = readNodeReviewParameters(driver, request.nodeId);
  const events = driver.queryAll('SELECT * FROM review_log WHERE node_id = ?', [request.nodeId])
    .map(row => identityReviewRowSchema.parse(row));
  return (grade: number) => {
    const card = previewReviewAt(events, settings, { grade, now: request.now });
    if (!card) throw new Error('review_history_preview_missing');
    return { card, reviewed_at: request.now };
  };
}

export function previewNodeReviewHistory(request: NativeReviewPreviewArgs['request']): NativeReviewPreviewResult | null {
  const next = loadReviewHistory(request);
  return next ? { Again: next(1), Hard: next(2), Good: next(3), Easy: next(4) } : null;
}

export function gradeNodeReviewHistory(request: NativeReviewGradeArgs['request']) {
  const next = loadReviewHistory(request);
  if (!next) return null;
  const grades = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
  return next(grades[request.rating]);
}
