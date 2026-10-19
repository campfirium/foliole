import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createFakeCapacitorConnection } from '../../../companionSyncNodeVersionsTestSupport';
import { invalidateCompanionReadingScope } from '../../reading/companionReadingScope';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from '../../runtime/capacitorCompanionDatabaseOwner';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

type ProjectionPlan = { kind: 'nodes' | 'attachments'; details: string[] };
function readProjectionPlan(database: Database.Database, sql: string, params: unknown[]): ProjectionPlan | null {
  if (sql.startsWith('EXPLAIN') || (!sql.includes('selected_nodes') &&
    !(sql.includes('FROM nodes owner') && sql.includes('WHERE node_id IN')))) return null;
  const plan = database.prepare<unknown[], { detail: string }>(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  return { kind: sql.includes('selected_nodes') ? 'nodes' : 'attachments', details: plan.map(row => row.detail) };
}

export function createDisplayLibrary(platform: 'android' | 'ios', existingFile?: string) {
  invalidateCompanionReadingScope();
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-display-wal-'));
  const file = existingFile ?? path.join(root, 'library.db');
  const writer = new Database(file);
  const reading = deferred();
  const release = deferred();
  let holdDisplay = false;
  const counts = { rows: 0, queries: 0, fullQueries: 0 };
  const projectionPlans: ProjectionPlan[] = [];
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
        const plan = readProjectionPlan(database, sql, params);
        if (plan) projectionPlans.push(plan);
        if (sql.includes('AS collection_source_content')) {
          counts.rows += result.values?.length ?? 0;
          counts.queries += 1;
          if (!sql.includes('selected_nodes')) counts.fullQueries += 1;
        }
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
    isDatabase: async () => ({ result: Boolean(existingFile) }),
    retrieveConnection: async () => adapt(writer)
  } as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  return { owner, file, reading, release, directoryRows: () => counts.rows,
    projectionPlans: () => projectionPlans, directoryQueries: () => counts.queries,
    fullDirectoryQueries: () => counts.fullQueries, hold: () => { holdDisplay = true; },
    async close() {
      await owner.close();
      for (const connection of connections.values()) if (connection.open) connection.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}
