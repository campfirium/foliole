import { Worker } from 'node:worker_threads';

import type { CloudflarePagesUploadFile } from './cloudflarePagesAssets.js';
import type { CloudflarePagesPreparationResult } from './cloudflarePagesPreparationWorker.js';

/** Resolves only after the one-shot worker exits, so staging cleanup cannot race its reads. */
export function prepareCloudflarePagesFilesOffMainThread(root: string, signal?: AbortSignal): Promise<CloudflarePagesUploadFile[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const worker = new Worker(new URL('./cloudflarePagesPreparationWorker.js', import.meta.url), { workerData: root });
    let result: CloudflarePagesPreparationResult | undefined;
    let failure: Error | undefined;
    const abort = () => { void worker.terminate(); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', (message: CloudflarePagesPreparationResult) => { result = message; });
    worker.once('error', (error) => { failure = error instanceof Error ? error : new Error(String(error)); });
    worker.once('exit', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      if (failure) return reject(failure);
      if (code !== 0 || !result) return reject(new Error(`Cloudflare Pages preparation worker exited with code ${code}.`));
      if ('error' in result) return reject(new Error(result.error));
      resolve(result.files.map((file) => ({
        ...file, body: Buffer.from(file.body.buffer, file.body.byteOffset, file.body.byteLength)
      })));
    });
  });
}
