// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsSyncSqliteDiagnostic } from './windows-sync-sqlite-diagnostic-control.mjs';
import { diagnosticCases, diagnosticInvocation } from './windows-sync-sqlite-diagnostic.mjs';
import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { windowsDevRequiredTools } from './windows-dev-build-preflight.mjs';

it('registers one fixed diagnostic without Android or signing preparation', () => {
  expect(parseWindowsDevControlArgs(['sync-sqlite-diagnostic'])).toMatchObject({ action: 'sync-sqlite-diagnostic' });
  expect(windowsDevRequiredTools('sync-sqlite-diagnostic', { systemNode: 'node', systemNpmCli: 'npm',
    gitPath: 'git', tarPath: 'tar', adbPath: 'adb' })).toEqual(['node', 'npm', 'git', 'tar']);
  expect(diagnosticCases().map(item => item.name)).toEqual(['group-restore', 'database-15', 'large-restore', 'large-adoption']);
});

it.each(['DEFAULT', 'NORMAL'])('counts native and explicit commits in temporary databases with %s', mode => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/sqlite-diagnostic-test-'));
  const invocation = diagnosticInvocation({ root, mode, scenario: diagnosticCases()[0], repoRoot: process.cwd() });
  fs.mkdirSync(invocation.directory, { recursive: true });
  const file = path.join(root, 'probe.cjs');
  fs.writeFileSync(file, `const Database = require(require('node:path').resolve('node_modules/better-sqlite3'));
    const db = new Database(${JSON.stringify(path.join(root, 'library.db'))});
    db.pragma('journal_mode=WAL'); db.exec('CREATE TABLE value(n INTEGER)');
    db.prepare('BEGIN IMMEDIATE').run(); db.prepare('INSERT INTO value VALUES (1)').run(); db.prepare('COMMIT').run();
    db.transaction(() => db.prepare('INSERT INTO value VALUES (2)').run())();
    console.log(JSON.stringify({n:db.prepare('SELECT count(*) AS n FROM value').get().n,synchronous:db.pragma('synchronous',{simple:true})}));
    db.close();
    try { new Database(require('node:path').resolve('diagnostic-must-not-create.db')); process.exitCode=9; }
    catch(e) { if (!e.message.includes('requires_repository_temporary')) throw e; }
  `);
  const result = spawnSync(process.execPath, ['scripts/electron-sqlite-runner.mjs', '--require', path.resolve('scripts/windows/sync-sqlite-diagnostic-preload.cjs'), file], {
    env: invocation.env, encoding: 'utf8', timeout: 15000
  });
  expect(result.stderr).not.toContain('Error');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual({ n: 2, synchronous: 1 });
  const records = fs.readdirSync(invocation.directory).filter(name => name.endsWith('.jsonl'))
    .flatMap(name => fs.readFileSync(path.join(invocation.directory, name), 'utf8').trim().split('\n').map(JSON.parse));
  expect(records.some(row => row.event === 'sqlite_summary' && row.explicitCommits.count === 2)).toBe(true);
  expect(fs.existsSync('diagnostic-must-not-create.db')).toBe(false);
  fs.rmSync(root, { recursive: true });
});

it('preserves preparation output when the bounded command times out', async () => {
  const writes = [];
  const failure = Object.assign(new Error('preflight timeout'), { output: 'native failure detail' });
  await expect(runWindowsSyncSqliteDiagnostic({ action: 'sync-sqlite-diagnostic',
    execute: vi.fn().mockRejectedValue(failure), paths: { systemNode: 'node', repoRoot: '.' },
    evidenceRoot: '.tmp', fsApi: { writeFileSync: (_file, text) => writes.push(text) }
  })).rejects.toBe(failure);
  expect(writes.at(-1)).toContain('native failure detail');
  expect(writes.at(-1)).toContain('--preflight');
});


it('runs only the named snapshot test without SQLite interception or durability overrides', () => {
  expect(parseWindowsDevControlArgs(['sync-sqlite-diagnostic', '--mode', 'snapshot']))
    .toMatchObject({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'snapshot' });
  const cases = diagnosticCases('snapshot');
  expect(cases).toHaveLength(1);
  const invocation = diagnosticInvocation({ root: '.tmp/artifacts/probe', mode: 'DEFAULT',
    scenario: cases[0], repoRoot: process.cwd() });
  expect(invocation.args).not.toContain('--require');
  expect(invocation.args).toContain('spools a complete history');
  expect(invocation.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT).toBe(invocation.directory);
});
