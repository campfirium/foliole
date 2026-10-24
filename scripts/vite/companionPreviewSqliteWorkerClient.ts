import { Worker } from 'node:worker_threads';

type Reply = { id: number; ok: true; result: unknown }
  | { id: number; ok: false; message: string; code?: string };
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void }

export function createCompanionPreviewSqliteWorker(file: string) {
  const worker = new Worker(new URL('./companionPreviewSqliteWorker.mjs', import.meta.url), {
    workerData: { file }, execArgv: ['--experimental-strip-types']
  });
  const pending = new Map<number, Pending>();
  let sequence = 0;
  let failure: Error | null = null;
  let closing: Promise<void> | null = null;
  const fail = (error: Error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on('error', fail);
  worker.on('exit', (code) => fail(new Error(`Preview SQLite worker exited (${code}).`)));
  worker.on('message', (reply: Reply) => {
    const request = pending.get(reply.id);
    pending.delete(reply.id);
    if (reply.ok) request?.resolve(reply.result);
    else request?.reject(Object.assign(new Error(reply.message), reply.code ? { code: reply.code } : {}));
  });
  const call = (method: string, options: unknown): Promise<unknown> => {
    if (failure) return Promise.reject(failure);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, options });
    });
  };
  return {
    call(method: string, options: unknown) {
      if (closing) return Promise.reject(new Error('Preview document is closed.'));
      return call(method, options);
    },
    close() {
      closing ??= call('closeAllConnections', {}).then(() => undefined).finally(async () => { await worker.terminate(); });
      return closing;
    }
  };
}
