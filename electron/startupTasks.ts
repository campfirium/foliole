import { desktopTaskScheduler } from './desktopTaskScheduler.js';
import type { DesktopTaskContext, DesktopTaskHandle } from './desktopTaskTypes.js';

export function runStartupTask(
  label: string,
  task: (context: DesktopTaskContext) => Promise<unknown> | unknown
): DesktopTaskHandle {
  const id = label
    .toLowerCase()
    .replace(/^\[|\]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const handle = desktopTaskScheduler.submit({
    concurrencyKey: id,
    duplicatePolicy: 'coalesce',
    failureLabel: label,
    id,
    label,
    priority: 'startup',
    run: task,
    runOn: 'main',
    source: 'startup-followup',
    startup: true
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
