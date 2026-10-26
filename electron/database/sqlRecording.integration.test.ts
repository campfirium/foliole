// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

afterEach(() => { sqlRecording.stop(); });

it('loads the recorder through the same strip-only source path as database workers', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types',
    '--input-type=module', '--eval',
    `import { SqlRecording } from './lib/core/diagnostics/sqlRecording.ts';
     const recorder = new SqlRecording(() => 0);
     recorder.start();
     recorder.measure('SELECT 1', 'get', 'desktop', () => ({ value: 1 }));
     console.log(JSON.stringify(recorder.stop().groups.map(group => group.count)));`
  ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  expect(JSON.parse(stdout)).toEqual([1]);
});

it('records cached desktop driver and port calls while retaining rollback, binding and error behavior', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT)');
  const driver = createBetterSqlite3Driver(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  sqlRecording.start({ label: 'save' });
  try {
    for (let i = 0; i < 30; i++) driver.execute('INSERT INTO notes VALUES (?, ?)', [i, 'secret-body']);
    expect(driver.prepare('SELECT value FROM notes WHERE id = ?').get([1])).toEqual({ value: 'secret-body' });
    expect(await port.query('SELECT id FROM notes')).toHaveLength(30);
    await expect(port.transaction(async tx => {
      await tx.run('DELETE FROM notes');
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(driver.queryOne('SELECT COUNT(*) AS count FROM notes')).toEqual({ count: 30 });
    expect(() => driver.execute('INSERT INTO notes VALUES (?, ?)', [1, 'duplicate'])).toThrow();
    const report = sqlRecording.stop()!;
    expect(report.groups.find(group => group.sql === 'INSERT INTO notes VALUES (?, ?)'))
      .toMatchObject({ count: 31, errors: 1, host: 'desktop' });
    expect(report.groups.find(group => group.sql === 'SELECT id FROM notes')).toMatchObject({ returnedRows: 30 });
    expect(JSON.stringify(report)).not.toContain('secret-body');
  } finally { sqlite.close(); }
});
