// @vitest-environment node

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../lib/core/database/migrations.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sqlite-maintenance-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('backs up and restores sqlite through the script entrypoint', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  const backupPath = path.join(tempRoot, 'backup.db');
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('journal_mode = WAL');
  initializeDatabaseSchema(sqlite);
  sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('node-1', null, 'node-1', 1, '# original', null, null, '2026-03-14T10:00:00.000Z', '2026-03-14T10:00:00.000Z', null);
  sqlite.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)').run('node-1', 0);
  sqlite.close();

  await runScript('backup', '--db-path', dbPath, '--destination-path', backupPath);
  await expect(fs.access(backupPath)).resolves.toBeUndefined();

  const mutated = new BetterSqlite3(dbPath);
  mutated.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('# mutated', 'node-1');
  mutated.close();

  await runScript('restore', '--db-path', dbPath, '--source-path', backupPath);

  const restored = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  const row = restored.prepare('SELECT content FROM nodes WHERE id = ?').get('node-1');
  restored.close();

  expect(row).toEqual({ content: '# original' });
});

async function runScript(...args) {
  await execFileAsync('node', [
    '--experimental-strip-types',
    'scripts/sqlite-maintenance.ts',
    ...args
  ]);
}
