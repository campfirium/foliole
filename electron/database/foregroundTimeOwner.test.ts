// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { readForegroundTimePreservation, mergeRestoredForegroundTime } from '../../lib/core/database/foregroundTimeRestore.js';
import { loadForegroundSource } from '../../lib/core/database/foregroundTimeSource.js';

const local = vi.hoisted(() => ({ config: '' }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_config_dir: local.config }) }));

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { loadDesktopForegroundOwner } from './foregroundTimeOwner.js';

it('reuses local ownership after reopen and keeps copied historical sources single-owned outside backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-time-owner-'));
  const sourceFile = path.join(root, 'original.db');
  const firstFile = path.join(root, 'first.db'), secondFile = path.join(root, 'second.db');
  let original = new Database(sourceFile);
  try {
    local.config = path.join(root, 'original-config');
    original.exec(DESKTOP_FRESH_SCHEMA_STATEMENTS.join(';\n'));
    const owner = loadDesktopForegroundOwner(sourceFile);
    const source = loadForegroundSource(createBetterSqlite3Driver(original), owner);
    original.prepare('INSERT INTO foreground_daily_time VALUES (?, ?, ?, ?)').run(`${source}:2026-10-10`, source, '2026-10-10', 60_000);
    const preserved = await readForegroundTimePreservation(createBetterSqliteDbPort(original));
    original.close(); original = new Database(sourceFile);
    expect(loadDesktopForegroundOwner(sourceFile)).toBe(owner);
    expect(loadForegroundSource(createBetterSqlite3Driver(original), owner)).toBe(source);
    original.close();
    await fs.copyFile(sourceFile, firstFile); await fs.copyFile(sourceFile, secondFile);
    const writable = [];
    for (const [index, file] of [firstFile, secondFile].entries()) {
      local.config = path.join(root, `copy-${index}-config`);
      const sqlite = new Database(file);
      try {
        await mergeRestoredForegroundTime(createBetterSqliteDbPort(sqlite), preserved, 'copy');
        const copyOwner = loadDesktopForegroundOwner(file);
        expect(copyOwner).not.toBe(owner);
        const copySource = loadForegroundSource(createBetterSqlite3Driver(sqlite), copyOwner);
        expect(copySource).not.toBe(source);
        writable.push(copySource);
        expect(sqlite.prepare('SELECT SUM(duration_ms) FROM foreground_daily_time').pluck().get()).toBe(60_000);
        expect(loadForegroundSource(createBetterSqlite3Driver(sqlite), copyOwner)).toBe(copySource);
        expect(sqlite.prepare("SELECT count(*) FROM workspace_meta WHERE key GLOB 'foreground_time_source:*'").pluck().get()).toBe(2);
      } finally { sqlite.close(); }
    }
    expect(new Set(writable).size).toBe(2);
  } finally {
    if (original.open) original.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
