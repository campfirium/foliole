// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { loadCompanionStateAfterStructureSyncReport } from '../../../../../companion/companionStructureSyncSnapshot';
import { createFakeCapacitorConnection } from '../../../companionSyncNodeVersionsTestSupport';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from '../../runtime/capacitorCompanionDatabaseOwner';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function createLibrary(platform: 'android' | 'ios') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-display-wal-'));
  const file = path.join(root, 'library.db');
  const writer = new Database(file);
  const reading = deferred();
  const release = deferred();
  let holdDisplay = false;
  const connections = new Map<boolean, Database.Database>([[false, writer]]);
  const adapt = (database: Database.Database) => {
    const connection = createFakeCapacitorConnection(database);
    return { ...connection, getUrl: async () => ({ url: file }),
      async query(sql: string, params: unknown[] = []) {
        if (sql === 'BEGIN DEFERRED' || sql === 'ROLLBACK') {
          database.exec(sql);
          return { values: [] };
        }
        const result = await connection.query(sql, params);
        if (holdDisplay && sql.includes('AS collection_source_content')) {
          reading.resolve();
          await release.promise;
        }
        return result;
      }
    };
  };
  const manager = {
    async closeConnection(_name: string, readonly: boolean) {
      connections.get(readonly)?.close();
      connections.delete(readonly);
    },
    async createConnection(_name: string, _encrypted: boolean, _mode: string, _version: number, readonly: boolean) {
      const database = readonly ? new Database(file, { readonly: true }) : writer;
      connections.set(readonly, database);
      return adapt(database);
    },
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: false }),
    retrieveConnection: async () => adapt(writer)
  } as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  return { owner, file, reading, release, hold: () => { holdDisplay = true; },
    async close() {
      await owner.close();
      for (const connection of connections.values()) if (connection.open) connection.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}

it.each(['android', 'ios'] as const)('%s commits new text while the previous display snapshot is still reading', async platform => {
  const library = createLibrary(platform);
  const { owner, file, reading, release } = library;
  runtime.owner = owner;
  let snapshot: ReturnType<typeof loadCompanionStateAfterStructureSyncReport> | undefined;
  let write: Promise<unknown> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, title, content, created_at, updated_at) VALUES ('topic', 'Before', 'Old text', 'now', 'now')`));
    library.hold();
    snapshot = loadCompanionStateAfterStructureSyncReport();
    await reading.promise;
    write = owner.runWriter(db => db.transaction(tx => tx.run(
      "UPDATE nodes SET title = 'After', content = 'New text' WHERE id = 'topic'")));
    const committedBeforeDisplay = await Promise.race([
      write.then(() => true),
      new Promise<false>(done => { timeout = setTimeout(() => done(false), 500); })
    ]);
    const observer = new Database(file, { readonly: true });
    const persisted = observer.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get();
    observer.close();
    release.resolve();
    const displayed = await snapshot;
    await write;
    expect(committedBeforeDisplay, 'Display refresh must not own the writer queue').toBe(true);
    expect(persisted).toBe('New text');
    expect(displayed.state?.workspace_snapshot?.nodesById.topic?.title).toBe('Before');
  } finally {
    clearTimeout(timeout);
    release.resolve();
    await Promise.allSettled([snapshot, write]);
    await library.close();
    runtime.owner = null;
  }
});
