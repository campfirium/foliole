// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { verifyOfflineElectronArchive } from './windows-electron-offline-prepare.mjs';
import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { normalizeWindowsDevAction } from './windows-dev-action-contract.mjs';
import { runWindowsSyncSqliteDiagnostic } from './windows-sync-sqlite-diagnostic-control.mjs';

it('rejects corrupted and unrecognized archives before extraction', () => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/offline-electron-test-'));
  try {
    const file = path.join(root, 'archive.zip');
    fs.writeFileSync(file, 'trusted test bytes');
    const digest = createHash('sha256').update('trusted test bytes').digest('hex');
    expect(verifyOfflineElectronArchive(file, digest)).toBe(digest);
    expect(() => verifyOfflineElectronArchive(file, undefined)).toThrow('checksum mismatch');
    fs.appendFileSync(file, 'changed');
    expect(() => verifyOfflineElectronArchive(file, digest)).toThrow('checksum mismatch');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('prepares only the offline archive and verifies native SQLite without package installation', async () => {
  expect(parseWindowsDevControlArgs(['sync-sqlite-diagnostic', '--mode', 'offline']))
    .toMatchObject({ diagnosticMode: 'offline' });
  expect(normalizeWindowsDevAction('sync-sqlite-diagnostic-offline')).toBe('sync-sqlite-diagnostic');
  const execute = vi.fn().mockResolvedValue({ code: 0, output: '' });
  await runWindowsSyncSqliteDiagnostic({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'offline',
    execute, fsApi: { writeFileSync: vi.fn() }, evidenceRoot: '.tmp',
    paths: { repoRoot: '.', systemNode: 'node', tarPath: 'tar' } });
  expect(execute.mock.calls.map(call => call[1])).toEqual([
    ['scripts/windows/windows-electron-offline-prepare.mjs', path.join('.tmp', 'sqlite-diagnostic')],
    ['scripts/electron-sqlite-runner.mjs', '--preflight'],
    ['-a', '-cf', path.join('.tmp', 'sqlite-diagnostic.zip'), '-C', path.join('.tmp', 'sqlite-diagnostic'), '.']
  ]);
});
