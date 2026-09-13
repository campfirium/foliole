import { DESKTOP_OPERATION_DEFINITIONS, type DesktopOperationName } from './desktopOperationDefinitions.js';
import { desktopTaskScheduler } from './desktopTaskScheduler.js';
import type { DesktopTaskContext, DesktopTaskHandle, DesktopTaskPriority } from './desktopTaskTypes.js';

interface SubmitDesktopOperationArgs {
  concurrencyKey?: string;
  failureLabel?: string;
  id?: string;
  priority?: DesktopTaskPriority;
  run: (context: DesktopTaskContext) => Promise<unknown> | unknown;
}

export function submitDesktopOperation(
  name: DesktopOperationName,
  args: SubmitDesktopOperationArgs
): DesktopTaskHandle {
  const definition = DESKTOP_OPERATION_DEFINITIONS[name];
  return desktopTaskScheduler.submit({
    cancellable: definition.cancellable,
    concurrencyKey: args.concurrencyKey ?? definition.concurrencyKey,
    duplicatePolicy: definition.coalescing,
    ...(args.failureLabel ? { failureLabel: args.failureLabel } : {}),
    id: args.id ?? name,
    label: definition.label,
    ...(definition.maxWaitMs ? { maxWaitMs: definition.maxWaitMs } : {}),
    metadata: {
      cancellable: definition.cancellable,
      cost: definition.cost,
      progress: definition.progress,
      startupEligibility: definition.startupEligibility
    },
    priority: args.priority ?? definition.priority,
    resources: definition.resources,
    run: args.run,
    runOn: definition.runOn,
    source: definition.source,
    startup: definition.startupEligibility !== 'manual-only'
  });
}
