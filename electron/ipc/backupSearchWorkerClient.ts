import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';

import type { NativeBackupSearchNextResult } from '../../lib/platform/nativeBackupSearchContract.js';

import type { BackupSearchWorkerInput } from './backupSearchWorker.js';

type WorkerResponse =
  | { ok: true; request_id: string; result: NativeBackupSearchNextResult }
  | { error: string; ok: false; request_id: string };

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (result: NativeBackupSearchNextResult) => void;
}

function abortError() {
  return new DOMException('Backup search was cancelled.', 'AbortError');
}

export class BackupSearchWorkerClient {
  private exited = false;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly worker: Worker;

  constructor(input: BackupSearchWorkerInput, createWorker: (input: BackupSearchWorkerInput) => Worker = defaultWorker) {
    this.worker = createWorker(input);
    this.worker.on('message', (response: WorkerResponse) => this.handleMessage(response));
    this.worker.once('error', (error) => this.rejectAll(
      error instanceof Error ? error : new Error(String(error))
    ));
    this.worker.once('exit', (code) => {
      this.exited = true;
      if (this.pending.size > 0 || code !== 0) {
        this.rejectAll(new Error(`Backup search worker exited with code ${code}.`));
      }
    });
  }

  private handleMessage(response: WorkerResponse) {
    const pending = this.pending.get(response.request_id);
    if (!pending) return;
    this.pending.delete(response.request_id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error));
  }

  private rejectAll(error: Error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  next() {
    if (this.exited) return Promise.reject(new Error('Backup search worker is not running.'));
    const requestId = randomUUID();
    return new Promise<NativeBackupSearchNextResult>((resolve, reject) => {
      this.pending.set(requestId, { reject, resolve });
      this.worker.postMessage({ request_id: requestId, type: 'next' });
    });
  }

  async terminate() {
    if (this.exited) return;
    this.rejectAll(abortError());
    await this.worker.terminate();
    this.exited = true;
  }
}

function defaultWorker(input: BackupSearchWorkerInput) {
  return new Worker(new URL('./backupSearchWorker.js', import.meta.url), { workerData: input });
}
