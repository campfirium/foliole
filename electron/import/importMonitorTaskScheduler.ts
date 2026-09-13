import type { DesktopOperationName } from '../desktopOperationDefinitions.js';
import { submitDesktopOperation } from '../desktopOperations.js';

export function submitImportMonitorTask(args: {
  concurrencyKey: string;
  failureLabel: string;
  id: string;
  label: string;
  operation: Extract<DesktopOperationName, 'keep-import' | 'managed-inbox-import'>;
  priority?: 'background' | 'startup';
  run: () => Promise<unknown> | unknown;
  source: string;
}) {
  const handle = submitDesktopOperation(args.operation, {
    concurrencyKey: args.concurrencyKey,
    failureLabel: args.failureLabel,
    id: args.id,
    ...(args.priority ? { priority: args.priority } : {}),
    run: args.run,
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
