import { createDesktopRuntimeReviewSchedulerAdapter } from '../../../shared/platform/reviewSchedulerRuntimeAdapter';

import { createLocalReviewSchedulerAdapter } from './localReviewSchedulerAdapter';
import type { ReviewSchedulerAdapter } from './reviewTypes';

export function createReviewSchedulerAdapter(): ReviewSchedulerAdapter {
  return createDesktopRuntimeReviewSchedulerAdapter() ?? createLocalReviewSchedulerAdapter();
}
