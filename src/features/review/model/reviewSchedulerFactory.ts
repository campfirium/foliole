import { getRuntimeInvoke } from '../../../shared/platform/bridge';

import { createDesktopReviewSchedulerAdapter } from './desktopReviewSchedulerAdapter';
import { createLocalReviewSchedulerAdapter } from './localReviewSchedulerAdapter';
import type { ReviewSchedulerAdapter } from './reviewTypes';

export function createReviewSchedulerAdapter(): ReviewSchedulerAdapter {
  const invoke = getRuntimeInvoke();
  if (invoke) {
    return createDesktopReviewSchedulerAdapter(invoke);
  }
  return createLocalReviewSchedulerAdapter();
}
