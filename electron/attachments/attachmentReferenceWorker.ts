import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { readAttachmentReferenceInputs } from '../../lib/core/attachments/attachmentReferenceCache.js';
import { parseAttachmentReferenceInput } from '../../lib/core/attachments/attachmentReferenceInputs.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const input = workerData as { databasePath: string };

async function run() {
  const sqlite = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  const db = createBetterSqliteDbPort(sqlite, { transactionMode: 'deferred' });
  let after: string | null = null;
  try {
    for (;;) {
      const rows = await db.transaction(tx => readAttachmentReferenceInputs(tx, after));
      if (!rows.length) return;
      const results = rows.map(parseAttachmentReferenceInput);
      // Read transactions have ended before the host publishes this batch through its writer.
      await new Promise<void>((resolve, reject) => {
        parentPort!.once('message', (message: { ok: boolean; error?: string }) =>
          message.ok ? resolve() : reject(new Error(message.error ?? 'attachment_scan_batch_rejected')));
        parentPort!.postMessage({ results });
      });
      after = rows.at(-1)!.id;
    }
  } finally { sqlite.close(); }
}

run().then(() => parentPort?.postMessage({ complete: true }), error =>
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }));
