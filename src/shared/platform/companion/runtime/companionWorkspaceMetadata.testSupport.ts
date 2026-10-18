import { vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

export async function metadataOwner(entries: Array<[string, string]> = []) {
  const metadata = new Map(entries);
  let transactionActive = false;
  const connection = {
    beginTransaction: vi.fn(async () => {
      if (transactionActive) throw new Error('overlapping_metadata_transaction');
      transactionActive = true;
      return {};
    }),
    commitTransaction: vi.fn(async () => { transactionActive = false; return {}; }),
    rollbackTransaction: vi.fn(async () => { transactionActive = false; return {}; }),
    execute: vi.fn(async () => ({})),
    getUrl: vi.fn(async () => ({ url: '/isolated/metadata.db' })),
    isDBOpen: vi.fn(async () => ({ result: true })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql === 'PRAGMA quick_check') return { values: [{ quick_check: 'ok' }] };
      if (sql === 'PRAGMA journal_mode') return { values: [{ journal_mode: 'wal' }] };
      if (sql === 'PRAGMA user_version') return { values: [{ user_version: COMPANION_DATABASE_VERSION }] };
      if (sql.includes("name = 'companion_meta'")) return { values: [{ present: 1 }] };
      if (sql.includes('pragma_table_info')) return { values: [{ name: 'present' }] };
      if (sql.includes('companion_meta') && values[0] === 'device_id') return { values: [{ value: 'device' }] };
      if (sql.includes('companion_meta') && sql.includes('key IN')) {
        return { values: [...metadata].filter(([key]) => values.includes(key)).map(([key, value]) => ({ key, value })) };
      }
      return { values: [] };
    }),
    run: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO companion_meta')) metadata.set(String(values[0]), String(values[1]));
      if (sql.startsWith('DELETE FROM companion_meta')) metadata.delete(String(values[0]));
      return { changes: { changes: 1 } };
    })
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: true })),
    isDatabase: vi.fn(async () => ({ result: true })),
    retrieveConnection: vi.fn(async () => connection)
  } as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, 'ios');
  await owner.open({ expectedHostName: 'device', now: '2026-10-18T00:00:00Z' });
  connection.beginTransaction.mockClear();
  connection.commitTransaction.mockClear();
  connection.rollbackTransaction.mockClear();
  return { owner, connection, metadata };
}
