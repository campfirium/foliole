// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { loadCompanionStateAfterStructureSyncReport } from '../../../../../companion/companionStructureSyncSnapshot';
import { createFakeCapacitorConnection } from '../../../companionSyncNodeVersionsTestSupport';
import { refreshCompanionWorkspaceAfterMutation } from '../../companionWorkspaceRepository';
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
  let directoryRows = 0;
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
        if (sql.includes('AS collection_source_content')) directoryRows += result.values?.length ?? 0;
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
  return { owner, file, reading, release, directoryRows: () => directoryRows, hold: () => { holdDisplay = true; },
    async close() {
      await owner.close();
      for (const connection of connections.values()) if (connection.open) connection.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}

it.each([
  { platform: 'android', origin: 'remote' }, { platform: 'ios', origin: 'remote' },
  { platform: 'android', origin: 'local' }, { platform: 'ios', origin: 'local' }
] as const)('$platform commits new text during a $origin display refresh', async ({ platform, origin }) => {
  const library = createLibrary(platform);
  const { owner, file, reading, release } = library;
  runtime.owner = owner;
  let snapshot: ReturnType<typeof refreshCompanionWorkspaceAfterMutation> | undefined;
  let write: Promise<unknown> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await owner.runWriter(db => db.run(`INSERT INTO nodes
      (id, title, content, created_at, updated_at) VALUES ('topic', 'Before', 'Old text', 'now', 'now')`));
    library.hold();
    snapshot = origin === 'remote'
      ? loadCompanionStateAfterStructureSyncReport().then(report => report.state?.workspace_snapshot ?? null)
      : refreshCompanionWorkspaceAfterMutation();
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
    expect(displayed?.nodesById.topic?.title).toBe('Before');
  } finally {
    clearTimeout(timeout);
    release.resolve();
    await Promise.allSettled([snapshot, write]);
    await library.close();
    runtime.owner = null;
  }
});


it('refreshes edited topic projections without transferring unrelated directory rows', async () => {
  const library = createLibrary('android');
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(db => db.run(`WITH RECURSIVE series(n) AS (
      VALUES(1) UNION ALL SELECT n + 1 FROM series WHERE n < 3000
    ) INSERT INTO nodes (id, title, content, created_at, updated_at)
      SELECT 'node-' || n, 'Topic ' || n, 'Old text', 'now', 'now' FROM series`));
    await library.owner.runWriter(db => db.run(
      "UPDATE nodes SET parent_id = 'node-1' WHERE id = 'node-2'"));
    const before = await refreshCompanionWorkspaceAfterMutation();
    await library.owner.runWriter(db => db.run(
      "UPDATE nodes SET title = 'Changed', content = '' WHERE id IN ('node-1', 'node-2')"));
    const start = library.directoryRows();
    const refreshed = await refreshCompanionWorkspaceAfterMutation(before, 'node-1');
    const transferred = library.directoryRows() - start;
    const complete = await refreshCompanionWorkspaceAfterMutation();
    expect(refreshed).toEqual(complete);
    expect(transferred, 'One content edit must not transfer the whole directory').toBeLessThanOrEqual(2);
  } finally {
    await library.close();
    runtime.owner = null;
  }
});
