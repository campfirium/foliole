import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

export function submitImportMonitorTask(args: {
  concurrencyKey: string;
  failureLabel: string;
  id: string;
  label: string;
  run: () => Promise<unknown> | unknown;
  source: string;
}) {
  const handle = desktopTaskScheduler.submit({
    cancellable: true,
    concurrencyKey: args.concurrencyKey,
    duplicatePolicy: 'coalesce',
    failureLabel: args.failureLabel,
    id: args.id,
    label: args.label,
    priority: 'background',
    run: args.run,
    runOn: 'main',
    source: args.source
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
