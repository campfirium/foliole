// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadCompanionForegroundOwner } from './companionForegroundTimeOwner';

it.each(['android', 'ios'] as const)('%s retains local ownership outside the replaceable library and allocates independent owners', async (platform) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mobile-time-owner-'));
  let sqlite: Database.Database | null = null;
  const manager = {
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: true }),
    async createConnection(name: string) {
      sqlite = new Database(path.join(root, name + '.db'));
      const db = sqlite;
      // Replace the native plugin boundary with real SQLite; retain the production Capacitor connection and DbPort.
      return new SQLiteDBConnection(name, false, {
        isDBOpen: async () => ({ result: db.open }), open: async () => undefined,
        async run(args: { statement: string; values: unknown[] }) {
          const result = db.prepare(args.statement).run(...args.values);
          return { changes: { changes: result.changes, lastId: Number(result.lastInsertRowid) } };
        },
        query: async (args: { statement: string; values: unknown[] }) => ({ values: db.prepare(args.statement).all(...args.values) })
      });
    },
    retrieveConnection: async (): Promise<SQLiteDBConnection> => { throw new Error('unexpected existing connection'); },
    closeConnection: async () => { sqlite?.close(); sqlite = null; }
  };
  try {
    const args = { manager, libraryPath: '/local/library.db', platform };
    const first = await loadCompanionForegroundOwner(args);
    expect(await loadCompanionForegroundOwner(args)).toBe(first);
    expect(await loadCompanionForegroundOwner({ ...args, libraryPath: '/other/library.db' })).not.toBe(first);
    expect(sqlite).toBeNull();
    const persisted = new Database(path.join(root, 'foliole-foreground-time-owners.db'), { readonly: true });
    try { expect(persisted.prepare('SELECT count(*) FROM foreground_time_owners').pluck().get()).toBe(2); }
    finally { persisted.close(); }
  } finally {
    await manager.closeConnection();
    await fs.rm(root, { force: true, recursive: true });
  }
});
