import { createNativeReviewSchedulerAdapter, type ReviewSchedulerAdapter } from '../../../lib/core/review/index.js';

import { getRuntimeInvoke } from './bridge';

export function createDesktopRuntimeReviewSchedulerAdapter(): ReviewSchedulerAdapter | null {
  const invoke = getRuntimeInvoke();
  return invoke ? createNativeReviewSchedulerAdapter(invoke) : null;
}
