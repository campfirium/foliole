import { Worker } from 'node:worker_threads';

import Database from 'better-sqlite3';

import type { SearchIndexWorkerInput } from '../ipc/searchIndexWorkerContract.js';

export function runSourceSearchWorker(input: SearchIndexWorkerInput) {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('../ipc/searchIndexRebuildWorker.ts', import.meta.url), {
      workerData: input,
      execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types']
    });
    let result: { ok: boolean; message?: string } | undefined;
    worker.once('message', (message: typeof result) => { result = message; });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0 || !result?.ok) reject(new Error(result?.message ?? `search_worker_exit:${code}`));
      else resolve();
    });
  });
}

export function searchRows(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT title, path, content, node_id, updated_at, is_trashed
    FROM search.node_search ORDER BY node_id`).all();
}

export function searchMatches(sqlite: Database.Database, term: string) {
  return sqlite.prepare('SELECT node_id FROM search.node_search WHERE node_search MATCH ? ORDER BY node_id').all(term);
}
