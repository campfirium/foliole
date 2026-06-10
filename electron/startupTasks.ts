import { desktopTaskScheduler } from './desktopTaskScheduler.js';
import type {
  DesktopTaskContext,
  DesktopTaskCost,
  DesktopTaskHandle,
  DesktopTaskProgressCapability,
  DesktopTaskRunLocation,
  DesktopTaskStartupEligibility
} from './desktopTaskTypes.js';

interface StartupTaskOptions {
  cancellable: boolean;
  cost: DesktopTaskCost;
  progress: DesktopTaskProgressCapability;
  runOn?: DesktopTaskRunLocation;
  startupEligibility?: DesktopTaskStartupEligibility;
}

export function runStartupTask(
  label: string,
  task: (context: DesktopTaskContext) => Promise<unknown> | unknown,
  options: StartupTaskOptions
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
    cancellable: options.cancellable,
    metadata: {
      cancellable: options.cancellable,
      cost: options.cost,
      progress: options.progress,
      startupEligibility: options.startupEligibility ?? 'startup-allowed'
    },
    priority: 'startup',
    run: task,
    runOn: options.runOn ?? 'main',
    source: 'startup-followup',
    startup: true
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
