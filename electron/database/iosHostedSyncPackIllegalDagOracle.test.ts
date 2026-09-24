import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { readHostedPack } from '../../scripts/ios/ios-hosted-sync-pack-evidence.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rejects the fixed illegal DAG oracle with its missing-parent error', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-illegal-dag-oracle-'));
  const incomingPath = path.join(tempRoot, 'illegal-dag.db');
  const oracle = readHostedPack(
    'scripts/ios/fixtures/acceptance-contract-corpus/sync-pack-runtime/illegal-dag.syncpack'
  );
  await fs.writeFile(incomingPath, oracle.database);
  const incoming = new Database(incomingPath);
  incoming.exec(`CREATE TABLE node_sync_tombstones (
    node_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, parent_version_id TEXT,
    host_name TEXT NOT NULL, content_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL,
    deleted_at TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  incoming.close();
  const main = new Database(':memory:');
  initializeDatabaseSchema(main);
  const port = createBetterSqliteDbPort(main, { name: 'sync-pack-illegal-dag-oracle-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: oracle.manifest.from_state_seq,
      hostName: 'ios-static-oracle'
    })).rejects.toThrow('sync_pack_node_version_missing_parent');
  } finally {
    await port.run('DETACH DATABASE inc');
    main.close();
  }
});
