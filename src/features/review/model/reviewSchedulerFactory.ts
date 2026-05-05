import { getRuntimeInvoke } from '../../../shared/platform/bridge';

import { createLocalReviewSchedulerAdapter } from './localReviewSchedulerAdapter';
import type { ReviewSchedulerAdapter } from './reviewTypes';
import { createRustReviewSchedulerAdapter } from './rustReviewSchedulerAdapter';

export type ReviewSchedulerMode = 'prefer-rust' | 'rust-only';

function getSchedulerModeFromEnv(): ReviewSchedulerMode {
  const mode = import.meta.env.VITE_REVIEW_SCHEDULER_MODE;
  if (mode === 'rust-only') {
    return 'rust-only';
  }
  return 'prefer-rust';
}

function createUnavailableRustAdapter(): ReviewSchedulerAdapter {
  return {
    grade: async () => {
      throw new Error('Rust scheduler is required, but Tauri invoke is unavailable');
    }
  };
}

export function createReviewSchedulerAdapter(mode = getSchedulerModeFromEnv()): ReviewSchedulerAdapter {
  const invoke = getRuntimeInvoke();
  if (invoke) {
    return createRustReviewSchedulerAdapter(invoke);
  }
  if (mode === 'rust-only') {
    return createUnavailableRustAdapter();
  }
  return createLocalReviewSchedulerAdapter();
}
