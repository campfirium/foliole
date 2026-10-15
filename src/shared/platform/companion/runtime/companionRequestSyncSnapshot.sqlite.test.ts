// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { CompanionRequestSyncSnapshots } from './companionRequestSyncSnapshot';

it.each(['android', 'ios'] as const)('%s keeps an independent snapshot and releases it on owner close', async platform => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-request-snapshot-'));
  const file = path.join(root, 'library.db');
  const writer = new Database(file);
  writer.pragma('journal_mode = WAL');
  writer.exec('CREATE TABLE facts (revision INTEGER); INSERT INTO facts VALUES (1)');
  const { manager, isClosed } = readManager(file);
  const snapshots = new CompanionRequestSyncSnapshots(manager, platform);
  let retained: DbPort | undefined;
  try {
    await snapshots.read(async db => {
      retained = db;
      expect(await db.query('SELECT revision FROM facts')).toEqual([{ revision: 1 }]);
      writer.exec('UPDATE facts SET revision = 2');
      expect(await db.query('SELECT revision FROM facts')).toEqual([{ revision: 1 }]);
      await expect(db.run('UPDATE facts SET revision = 3')).rejects.toThrow('write_forbidden');
    });
    await expect(retained?.query('SELECT 1')).rejects.toThrow('snapshot_closed');
    expect(isClosed()).toBe(true);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const read = snapshots.read(async db => {
      expect(await db.query('SELECT revision FROM facts')).toEqual([{ revision: 2 }]);
      started(); await gate;
      await db.query('SELECT revision FROM facts');
    });
    await entered;
    const rejected = expect(read).rejects.toThrow('owner_closed');
    const queued = expect(snapshots.read(async () => true)).rejects.toThrow('owner_closed');
    const closing = snapshots.close();
    release();
    await Promise.all([rejected, queued, closing]);
    expect(isClosed()).toBe(true);
    expect(writer.pragma('wal_checkpoint(TRUNCATE)')).toEqual([{ busy: 0, log: 0, checkpointed: 0 }]);
  } finally {
    await snapshots.close();
    writer.close();
    await rm(root, { recursive: true });
  }
});

it.each(['android', 'ios'] as const)('%s reports snapshot open context and releases a failed native connection', async platform => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-snapshot-open-'));
  const file = path.join(root, 'library.db');
  new Database(file).close();
  const nativeError = new Error('Open: Failed in openOrCreateDatabase Cannot open the DB');
  const { manager, isClosed } = readManager(file, nativeError);
  const snapshots = new CompanionRequestSyncSnapshots(manager, platform);
  let entered = false;
  try {
    const read = snapshots.read(async () => { entered = true; });
    await expect(read).rejects.toThrow(`request_sync_snapshot_open_failed:${platform}: ${nativeError.message}`);
    await expect(read).rejects.toMatchObject({ cause: nativeError });
    expect(entered).toBe(false);
    expect(isClosed()).toBe(true);
  } finally { await snapshots.close(); await rm(root, { recursive: true }); }
});

function readManager(file: string, openError?: Error) {
  let reader: Database.Database | null = null;
  const manager = {
    async createConnection(name: string, _encrypted: boolean, _mode: string, _version: number, readonly: boolean) {
      expect(readonly).toBe(true);
      expect(reader).toBeNull();
      reader = new Database(file, { readonly: true, fileMustExist: true });
      const db = reader;
      return new SQLiteDBConnection(name, readonly, {
        open: async () => { if (openError) throw openError; },
        async query(args: { readonly: boolean; statement: string; values: unknown[] }) {
          expect(args.readonly).toBe(true);
          const statement = db.prepare(args.statement);
          if (statement.reader) return { values: statement.all(...args.values) };
          statement.run(...args.values);
          return { values: [] };
        }
      });
    },
    async closeConnection(_name: string, readonly: boolean) {
      expect(readonly).toBe(true);
      reader?.close(); reader = null;
    },
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: true }),
    retrieveConnection: async (): Promise<SQLiteDBConnection> => { throw new Error('unexpected retrieval'); }
  };
  return { manager, isClosed: () => reader === null };
}
