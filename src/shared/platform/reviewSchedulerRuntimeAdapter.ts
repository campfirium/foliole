import type { ReviewSchedulerAdapter } from '../../../lib/core/review/index.js';
import { createNativeReviewSchedulerAdapter } from '../../../lib/platform/nativeReviewSchedulerAdapter.js';

import { getRuntimeInvoke } from './bridge';

export function createDesktopRuntimeReviewSchedulerAdapter(): ReviewSchedulerAdapter | null {
  const invoke = getRuntimeInvoke();
  return invoke ? createNativeReviewSchedulerAdapter(invoke) : null;
}
