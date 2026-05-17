import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

export function submitPdfIndexingTask(attachmentId: string, processAttachment: () => Promise<void>) {
  const handle = desktopTaskScheduler.submit({
    cancellable: true,
    concurrencyKey: 'pdf-indexing',
    duplicatePolicy: 'enqueue',
    failureLabel: '[pdf] attachment indexing failed',
    id: `pdf-indexing:${attachmentId}`,
    label: 'PDF attachment indexing',
    priority: 'background',
    run: async (context) => {
      context.progress({ message: 'indexing PDF attachment', unit: 'attachment' });
      await context.yieldIfNeeded();
      await processAttachment();
      await context.yieldIfNeeded();
    },
    runOn: 'main',
    source: 'pdf-indexing'
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
