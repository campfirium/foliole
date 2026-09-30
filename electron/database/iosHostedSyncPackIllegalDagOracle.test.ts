import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncPackNodeRowsWithDbPort } from '../../lib/core/sync/syncPackNodeRowsApply.js';
import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.js';
import { readHostedPack } from '../../scripts/ios/ios-hosted-sync-pack-evidence.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

it('preserves the fixed historical-gap fixture without inventing its missing ancestor', async () => {
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
  const [manifestRow] = incoming.prepare("SELECT value FROM pack_manifest WHERE key = 'manifest_json'")
    .all() as Array<{ value: string }>;
  const inner = JSON.parse(manifestRow!.value) as Record<string, unknown>;
  incoming.prepare("UPDATE pack_manifest SET value = ? WHERE key = 'manifest_json'")
    .run(JSON.stringify({ ...inner, source_epoch: 'source-test',
      frontier_state_seq: oracle.manifest.to_state_seq }));
  incoming.close();
  const main = new Database(':memory:');
  initializeDatabaseSchema(main);
  const port = createBetterSqliteDbPort(main, { name: 'sync-pack-illegal-dag-oracle-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeRowsWithDbPort(port);
    await expect(applySyncPackNodeVersionsWithDbPort(port)).resolves.toBeUndefined();
    expect(main.prepare("SELECT version_id FROM node_sync_versions WHERE version_id = 'missing#ancestor'").get())
      .toBeUndefined();
    expect(main.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE parent_version_id = 'missing#ancestor'")
      .pluck().all()).toEqual(['missing#ancestor']);
  } finally {
    await port.run('DETACH DATABASE inc');
    main.close();
  }
});
