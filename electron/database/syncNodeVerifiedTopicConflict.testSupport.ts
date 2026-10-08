import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { textBranch } from './topicTextState.testSupport.js';

export const FORMED_AT = '2026-10-07T12:00:00.000Z';
export const BASE_AT = '2026-10-07T00:00:00.000Z';

export function branches(localBody: string, incomingBody: string) {
  const base = textBranch('base', 'Original', undefined, BASE_AT);
  const local = textBranch('local', localBody, base, '2026-10-07T01:00:00.000Z');
  const incoming = textBranch('incoming', incomingBody, base, '2026-10-07T02:00:00.000Z');
  return { base, local, incoming };
}

/** Observe the real database boundary; no body storage or graph query is mocked. */
export function observeReads(db: DbPort) {
  const sizes: number[] = [];
  const observe = (source: DbPort): DbPort => ({ ...source,
    query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await source.query<T>(sql, params);
      for (const row of rows) {
        if (row.data instanceof Uint8Array) sizes.push(row.data.byteLength);
        if (typeof row.body_text === 'string') throw new Error('unexpected_full_body_read');
      }
      return rows;
    },
    transaction: (run) => source.transaction((tx) => run(observe(tx)))
  });
  return { port: observe(db), sizes };
}
