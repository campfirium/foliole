import type { QueuedDesktopTask } from './desktopTaskQueue.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';

const SLOW_DATABASE_WRITE_WAIT_MS = 1_000;

export function logDesktopTaskDatabaseWait(task: QueuedDesktopTask, startedAt: number) {
  const waitMs = startedAt - task.submittedAt;
  if (waitMs < SLOW_DATABASE_WRITE_WAIT_MS || task.attempt !== 1 || !task.databaseWriteBlocker) return;
  appendMainProcessDiagnosticLog('desktop_database_write_wait', {
    lastObservedBlocker: task.databaseWriteBlocker,
    operation: task.definition.source,
    resource: 'main-database-write',
    waitMs
  }, 'warn');
}
