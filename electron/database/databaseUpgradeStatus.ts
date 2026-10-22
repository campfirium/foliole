import type { NativeDatabaseUpgradeStatus } from '../../lib/platform/nativeDatabaseUpgradeContract.js';

import { isDatabaseStartupPending } from './databaseReadiness.js';
import type { DatabaseUpgradeProgress } from './databaseUpgradeWorkerContract.js';

let current: DatabaseUpgradeProgress | null = null;

export function reportDatabaseUpgradeProgress(progress: DatabaseUpgradeProgress) {
  current = progress;
}

export function clearDatabaseUpgradeProgress() {
  current = null;
}

export function loadDatabaseUpgradeStatus(): NativeDatabaseUpgradeStatus {
  if (current) {
    return { completed: current.version - current.from, state: 'upgrading', total: current.to - current.from };
  }
  return isDatabaseStartupPending() ? { state: 'starting' } : { state: 'ready' };
}
