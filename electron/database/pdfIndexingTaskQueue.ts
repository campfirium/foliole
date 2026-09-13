import { submitDesktopOperation } from '../desktopOperations.js';

export function submitPdfIndexingTask(attachmentId: string, processAttachment: () => Promise<void>) {
  const handle = submitDesktopOperation('pdf-indexing', {
    failureLabel: '[pdf] attachment indexing failed',
    id: `pdf-indexing:${attachmentId}`,
    run: async (context) => {
      context.progress({ message: 'indexing PDF attachment', unit: 'attachment' });
      await context.yieldIfNeeded();
      await processAttachment();
      await context.yieldIfNeeded();
    }
  });
  void handle.promise.catch(() => undefined);
  return handle;
}
