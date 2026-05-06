import { createLocalReviewSchedulerAdapter as createCoreLocalReviewSchedulerAdapter } from '../../../../lib/core/review/index.js';
import { getCurrentReviewSchedulerSettings } from '../../settings/model/reviewSchedulerSettings';

export function createLocalReviewSchedulerAdapter() {
  return createCoreLocalReviewSchedulerAdapter({
    loadSettings: getCurrentReviewSchedulerSettings
  });
}
