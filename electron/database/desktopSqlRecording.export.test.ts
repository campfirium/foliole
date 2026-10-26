// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

it('exports an automatically stopped recording from the real desktop adapter', async () => {
  vi.resetModules();
  const directory = fs.mkdtempSync(path.resolve('.tmp/artifacts/t496-export-'));
  vi.stubEnv('FOLIOLE_SQL_RECORDING_MS', '20');
  vi.stubEnv('FOLIOLE_SQL_RECORDING_DIR', directory);
  const { createBetterSqlite3Driver } = await import('./betterSqlite3Driver.js');
  const { sqlRecording } = await import('../../lib/core/diagnostics/sqlRecording.js');
  const sqlite = new Database(':memory:');
  try {
    createBetterSqlite3Driver(sqlite).queryAll('SELECT ? AS value', ['private']);
    await new Promise(resolve => setTimeout(resolve, 60));
    const files = fs.readdirSync(directory);
    expect(files).toHaveLength(1);
    const file = path.join(directory, files[0]!);
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(report).toMatchObject({ running: false, pending: 0 });
    expect(report.groups).toEqual([expect.objectContaining({ count: 1, returnedRows: 1 })]);
    expect(JSON.stringify(report)).not.toContain('private');
    const summary = spawnSync(process.execPath, ['scripts/diagnostics/sql-recording-report.mjs', file], {
      encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    expect(summary.status, summary.stderr).toBe(0);
    expect(JSON.parse(summary.stdout).mostFrequent).toEqual([expect.objectContaining({ count: 1 })]);
  } finally {
    sqlRecording.stop(); sqlite.close(); vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, '__folioleSqlRecording');
    fs.rmSync(directory, { recursive: true });
  }
});
