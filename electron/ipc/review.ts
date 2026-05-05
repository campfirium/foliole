import { createFsrsReviewScheduler } from '../../lib/core/review/index.js';
import type {
  NativeReviewGradeArgs,
  NativeReviewPreviewArgs,
  NativeReviewPreviewResult
} from '../../lib/platform/nativeContract.js';
import {
  createReviewSchedulerParameters,
  getReviewSchedulerVersion,
  loadReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

const reviewScheduler = createFsrsReviewScheduler({
  loadSettings: loadReviewSchedulerSettings,
  getSettingsVersion: getReviewSchedulerVersion,
  createParameters: createReviewSchedulerParameters
});

export function reviewGrade(payload: NativeReviewGradeArgs) {
  return reviewScheduler.grade(payload.request);
}

export function reviewPreview(payload: NativeReviewPreviewArgs): NativeReviewPreviewResult {
  return reviewScheduler.preview(payload.request);
}
