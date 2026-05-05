let syncWriterTail: Promise<unknown> = Promise.resolve();

export function runCompanionSyncWriterTask<T>(task: () => Promise<T>): Promise<T> {
  const run = syncWriterTail.then(task, task);
  syncWriterTail = run.catch(() => undefined);
  return run;
}
