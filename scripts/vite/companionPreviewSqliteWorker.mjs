import { parentPort, workerData } from 'node:worker_threads';

import { createDocumentSqliteHost } from './companionPreviewSqliteDatabase.ts';

if (!parentPort) throw new Error('Preview SQLite requires a worker thread.');
const database = createDocumentSqliteHost(workerData.file);
parentPort.on('message', ({ id, method, options }) => {
  try {
    const result = method === 'closeAllConnections' ? database.close() : database.call(method, options);
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error),
      ...(typeof error?.code === 'string' ? { code: error.code } : {}) });
  }
});
