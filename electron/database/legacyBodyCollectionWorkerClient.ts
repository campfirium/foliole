import { Worker } from 'node:worker_threads';

export function runLegacyBodyCollectionWorker(dbPath: string, limit: number, signal: AbortSignal): Promise<{ completed: boolean; paused?: boolean }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const worker = new Worker(new URL('./legacyBodyCollectionWorker.js', import.meta.url), { workerData: { dbPath, limit } });
    let result: { ok: boolean; result: { completed: boolean; paused?: boolean }; message?: string } | null = null;
    // Settle only after exit, so cancellation cannot release the library resource early.
    const abort = () => { void worker.terminate(); };
    signal.addEventListener('abort', abort, { once: true });
    let failure: Error | null = null;
    worker.once('message', (message) => { result = message; });
    worker.once('error', (error) => { failure = error instanceof Error ? error : new Error(String(error)); });
    worker.once('exit', (code) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      if (failure) return reject(failure);
      if (code !== 0 || !result) return reject(new Error(`Body collection worker exited without a result: ${code}`));
      if (!result.ok) return reject(new Error(result.message));
      resolve(result.result);
    });
  });
}
