import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';

import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface RestoreItem {
  content: string;
  nodeId: string;
  title: string;
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredAbsolutePath(name: string) {
  const value = argValue(name);
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path`);
  return path.resolve(value);
}

async function writeReceipt(outputDir: string, name: string, payload: unknown) {
  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, name);
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  return target;
}

function buildPlan(sqlite: InstanceType<typeof BetterSqlite3>, sourcePath: string) {
  sqlite.prepare('ATTACH DATABASE ? AS restore_source').run(sourcePath);
  try {
    const items = sqlite.prepare(`
      SELECT current.id nodeId, current.title title, restore.content content
      FROM nodes current
      JOIN import_sources source ON source.latest_node_id = current.id
      JOIN restore_source.nodes restore ON restore.id = current.id
      WHERE current.deleted_at IS NULL
        AND source.remote_provider = 'readwise'
        AND json_extract(source.remote_import_state_json, '$.metadata.category') = 'article'
        AND current.content NOT LIKE '---%'
        AND restore.deleted_at IS NULL
        AND restore.content LIKE '---%'
      ORDER BY current.id
    `).all() as RestoreItem[];
    const payload = {
      counts: { articles: items.length },
      items: items.map((item) => ({
        contentHash: sha256(item.content), nodeId: item.nodeId, title: item.title
      }))
    };
    return { ...payload, planHash: sha256(JSON.stringify(payload)) };
  } finally {
    sqlite.prepare('DETACH DATABASE restore_source').run();
  }
}

function applyPlan(input: {
  driver: ReturnType<typeof createBetterSqlite3Driver>;
  items: RestoreItem[];
  now: string;
}) {
  const hostName = requireDatabaseHostName(input.driver);
  input.driver.transaction((tx) => {
    input.items.forEach((item) => {
      writeNodeBody({ content: item.content, driver: tx, nodeId: item.nodeId, title: item.title, updatedAt: input.now });
      tx.execute('UPDATE nodes SET sync_dirty = 1, updated_at = ? WHERE id = ?', [input.now, item.nodeId]);
      if (!flushNodeSyncVersionWithDriver(tx, item.nodeId, hostName, input.now)) {
        throw new Error(`readwise_article_format_version_failed:${item.nodeId}`);
      }
    });
    enqueueWorkspaceSearchInvalidationForNodeIds(tx, input.items.map((item) => item.nodeId));
  });
  return { restored: input.items.length };
}

async function main() {
  const dbPath = requiredAbsolutePath('--db-path');
  const sourcePath = requiredAbsolutePath('--source-db-path');
  const outputDir = path.resolve(argValue('--receipt-dir') ?? '.tmp/artifacts/readwise-article-format-restore');
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--writer-stopped')) throw new Error('--writer-stopped is required for apply');
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly: !apply });
  const driver = createBetterSqlite3Driver(sqlite);
  try {
    assertSqliteIntegrity(sqlite);
    const plan = buildPlan(sqlite, sourcePath);
    if (!apply) {
      const receipt = await writeReceipt(outputDir, `dry-run-${new Date().toISOString().replaceAll(':', '-')}.json`, {
        databasePath: dbPath, mode: 'dry-run', sourcePath, ...plan
      });
      console.log(JSON.stringify({ receipt, ...plan }, null, 2));
      return;
    }
    const expectedPlanHash = argValue('--expected-plan-hash');
    if (!expectedPlanHash || expectedPlanHash !== plan.planHash) {
      throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    }
    const backupPath = await createVerifiedSqliteBackup({
      dbPath, name: 'foliole-before-readwise-article-format-restore',
      openReadonly: (target) => new BetterSqlite3(target, { fileMustExist: true, readonly: true }),
      sqlite, stamp: new Date().toISOString()
    });
    const items = readItems(sqlite, sourcePath, plan.items.map((item) => item.nodeId));
    const result = applyPlan({ driver, items, now: new Date().toISOString() });
    const integrity = assertSqliteIntegrity(sqlite);
    const receipt = await writeReceipt(outputDir, `applied-${new Date().toISOString().replaceAll(':', '-')}.json`, {
      backupPath, databasePath: dbPath, integrity, mode: 'apply', result, sourcePath, summary: plan
    });
    console.log(JSON.stringify({ backupPath, receipt, result }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

function readItems(sqlite: InstanceType<typeof BetterSqlite3>, sourcePath: string, nodeIds: string[]) {
  sqlite.prepare('ATTACH DATABASE ? AS restore_source').run(sourcePath);
  try {
    const select = sqlite.prepare(`
      SELECT current.id nodeId, current.title title, restore.content content
      FROM nodes current JOIN restore_source.nodes restore ON restore.id = current.id
      WHERE current.id = ? AND current.deleted_at IS NULL AND restore.deleted_at IS NULL
    `);
    return nodeIds.map((nodeId) => select.get(nodeId) as RestoreItem);
  } finally {
    sqlite.prepare('DETACH DATABASE restore_source').run();
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
