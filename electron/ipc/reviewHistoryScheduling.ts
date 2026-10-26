import { readNodeReviewParameters } from '../../lib/core/database/reviewProjection.js';
import { previewReviewAt } from '../../lib/core/review/recomputeReview.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import type { NativeReviewPreviewArgs, NativeReviewPreviewResult } from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';

/** Preview at the candidate's event time; the write receipt owns the final full-history projection. */
export function previewNodeReviewHistory(request: NativeReviewPreviewArgs['request']): NativeReviewPreviewResult | null {
  if (!request.nodeId) return null;
  const driver = openDatabaseConnection().driver;
  const settings = readNodeReviewParameters(driver, request.nodeId);
  const events = driver.queryAll('SELECT * FROM review_log WHERE node_id = ?', [request.nodeId])
    .map(row => identityReviewRowSchema.parse(row));
  const next = (grade: number) => {
    const card = previewReviewAt(events, settings, { grade, now: request.now });
    if (!card) throw new Error('review_history_preview_missing');
    return { card, reviewed_at: request.now };
  };
  return { Again: next(1), Hard: next(2), Good: next(3), Easy: next(4) };
}
