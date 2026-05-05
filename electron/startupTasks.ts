import { appendBootEvent } from './ipc/boot.js';

export function runStartupTask(label: string, task: () => Promise<unknown>) {
  return task().catch((error) => {
    console.error(label, error);
    void appendBootEvent('startup_task_failed', {
      label,
      message: error instanceof Error ? error.message : String(error)
    }).catch((bootError) => {
      console.error('[electron-main] boot log failed: startup_task_failed', bootError);
    });
  });
}
