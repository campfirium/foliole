import { readNodeReviewParameters } from '../../lib/core/database/reviewProjection.js';
import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import type { NativeReviewPreviewArgs, NativeReviewPreviewResult } from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';

/** Preview the same full-history projection that the next immutable grade fact will persist. */
export function previewNodeReviewHistory(request: NativeReviewPreviewArgs['request']): NativeReviewPreviewResult | null {
  if (!request.nodeId) return null;
  const driver = openDatabaseConnection().driver;
  const settings = readNodeReviewParameters(driver, request.nodeId);
  const events = driver.queryAll('SELECT * FROM review_log WHERE node_id = ?', [request.nodeId])
    .map(row => identityReviewRowSchema.parse(row));
  const next = (grade: number) => {
    const card = recomputeReview([...events, { op_id: '~preview', kind: 'review', grade,
      reviewed_at: request.now, voids_op_id: null }], settings);
    if (!card) throw new Error('review_history_preview_missing');
    return { card, reviewed_at: request.now };
  };
  return { Again: next(1), Hard: next(2), Good: next(3), Easy: next(4) };
}
