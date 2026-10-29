import { Worker } from 'node:worker_threads';

import type { AttachmentReferenceResult } from '../../lib/core/attachments/attachmentReferenceInputs.js';

interface WorkerMessage { results?: AttachmentReferenceResult[]; complete?: boolean; error?: string }

/** One short-lived worker per observation; its readonly connection never owns the host writer. */
export function runAttachmentReferenceWorker(databasePath: string,
  publish: (rows: AttachmentReferenceResult[]) => Promise<unknown>, signal?: AbortSignal): Promise<number> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./attachmentReferenceWorker.js', import.meta.url), { workerData: { databasePath } });
    let parsed = 0;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      void worker.terminate().then(() => error ? reject(error) : resolve(parsed), reject);
    };
    const abort = () => finish(signal?.reason ?? new Error('attachment_scan_cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (settled) return;
      if (message.error) return finish(new Error(message.error));
      if (message.complete) return finish();
      if (!message.results) return finish(new Error('attachment_scan_worker_message_invalid'));
      parsed += message.results.length;
      void publish(message.results).then(() => {
        if (!settled) worker.postMessage({ ok: true });
      }, finish);
    });
    worker.once('error', finish);
    worker.once('exit', code => { if (!settled) finish(new Error(`attachment_scan_worker_exited:${code}`)); });
    if (signal?.aborted) abort();
  });
}
