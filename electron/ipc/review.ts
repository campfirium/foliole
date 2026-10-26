
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

import { previewNodeReviewHistory } from './reviewHistoryScheduling.js';

const reviewScheduler = createFsrsReviewScheduler({
  loadSettings: loadReviewSchedulerSettings,
  getSettingsVersion: getReviewSchedulerVersion,
  createParameters: createReviewSchedulerParameters
});

export function reviewGrade(payload: NativeReviewGradeArgs) {
  const preview = previewNodeReviewHistory(payload.request);
  return preview ? preview[payload.request.rating] : reviewScheduler.grade(payload.request);
}

export function reviewPreview(payload: NativeReviewPreviewArgs): NativeReviewPreviewResult {
  return previewNodeReviewHistory(payload.request) ?? reviewScheduler.preview(payload.request);
}
