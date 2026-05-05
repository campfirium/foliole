import type { ReviewSchedulerAdapter } from '../../../lib/core/review/index.js';
import { createNativeReviewSchedulerAdapter } from '../../../lib/platform/nativeReviewSchedulerAdapter.js';

import { getRuntimeInvoke } from './runtimeInvoke';

export function createDesktopRuntimeReviewSchedulerAdapter(): ReviewSchedulerAdapter | null {
  const invoke = getRuntimeInvoke();
  return invoke ? createNativeReviewSchedulerAdapter(invoke) : null;
}
