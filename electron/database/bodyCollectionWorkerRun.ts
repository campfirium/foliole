import { Worker } from 'node:worker_threads';

type WorkerMessage<T> = { ok: boolean; result: T; message?: string };

/** Runs one body collection worker and settles only after it exits. */
export function runBodyCollectionWorker<T>(workerUrl: URL, workerData: unknown, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const worker = new Worker(workerUrl, { workerData });
    let result: WorkerMessage<T> | null = null;
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
