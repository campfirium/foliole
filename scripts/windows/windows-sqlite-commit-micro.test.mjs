// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { normalizeWindowsDevAction } from './windows-dev-action-contract.mjs';
import { runWindowsSyncSqliteDiagnostic } from './windows-sync-sqlite-diagnostic-control.mjs';

it('routes the fixed micro submode without invoking Electron preparation', async () => {
  expect(parseWindowsDevControlArgs(['sync-sqlite-diagnostic', '--mode', 'micro']))
    .toMatchObject({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'micro' });
  expect(normalizeWindowsDevAction('sync-sqlite-diagnostic-micro')).toBe('sync-sqlite-diagnostic');
  expect(() => parseWindowsDevControlArgs(['deploy', '--mode', 'micro'])).toThrow();
  const execute = vi.fn().mockResolvedValue({ code: 0, output: '' });
  await runWindowsSyncSqliteDiagnostic({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'micro',
    execute, fsApi: { writeFileSync: vi.fn() }, evidenceRoot: '.tmp',
    paths: { repoRoot: '.', systemNode: 'node', tarPath: 'tar' } });
  expect(execute.mock.calls.map(call => call[1][0])).toEqual(['--experimental-sqlite', '-a']);
});

it('runs the download probe without invoking sync tests or dependency installation', async () => {
  expect(parseWindowsDevControlArgs(['sync-sqlite-diagnostic', '--mode', 'download']))
    .toMatchObject({ diagnosticMode: 'download' });
  expect(normalizeWindowsDevAction('sync-sqlite-diagnostic-download')).toBe('sync-sqlite-diagnostic');
  const execute = vi.fn().mockResolvedValue({ code: 0, output: '' });
  await runWindowsSyncSqliteDiagnostic({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'download',
    execute, fsApi: { writeFileSync: vi.fn() }, evidenceRoot: '.tmp',
    paths: { repoRoot: '.', systemNode: 'node', tarPath: 'tar' } });
  expect(execute.mock.calls.map(call => call[1][0])).toEqual(['scripts/windows/windows-electron-download-diagnostic.mjs', '-a']);
});

it('measures and verifies 2000 committed rows per mode using built-in SQLite', () => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/commit-micro-test-'));
  try {
    const result = spawnSync(process.execPath, ['--experimental-sqlite',
      'scripts/windows/windows-sqlite-commit-micro.mjs', root], { encoding: 'utf8', timeout: 20_000 });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'commit-micro.json'), 'utf8'));
    expect(report.cases.map(item => item.settings.synchronous)).toEqual([2, 1]);
    for (const item of report.cases) {
      expect(item.settings.journalMode).toBe('wal');
      expect(item.errors).toBe(0);
      expect(item.verified).toEqual({ rows: 2000, checksum: 1999000 });
      expect(item.commits.count).toBe(2000);
      expect(item.transactions.count).toBe(2000);
      expect(item.commits.meanMs).toBeGreaterThan(0);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
