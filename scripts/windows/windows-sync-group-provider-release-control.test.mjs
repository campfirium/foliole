// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevControl } from './windows-dev-control.mjs';
import {
  writeWindowsSyncGroupProviderRelease
} from './windows-sync-group-provider-release-control.mjs';
import { syncGroupInteractivePaths } from './windows-sync-group-interactive-state.mjs';
import { createWindowsDevRemoteSpecTestFixture } from
  './windows-dev-remote-spec-test-fixture.mjs';

const roots = [];
const transport = createWindowsDevRemoteSpecTestFixture();
afterAll(() => transport.cleanup());
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture(state = 'running') {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-release-control-'));
  roots.push(repoRoot);
  const paths = syncGroupInteractivePaths(repoRoot);
  fs.mkdirSync(path.dirname(paths.request), { recursive: true });
  const nonce = '00000000-0000-4000-8000-000000000002';
  fs.writeFileSync(paths.request, JSON.stringify({
    action: 'multi-device-sync-a-rejoin',
    evidenceRoot: path.join(repoRoot, '.tmp/artifacts/windows-dev-action/run-2'),
    nonce, schemaVersion: 1
  }));
  fs.writeFileSync(paths.status, JSON.stringify({ nonce, schemaVersion: 1, state }));
  return { nonce, paths, repoRoot };
}

it('atomically releases only the currently running provider request', () => {
  const { nonce, paths, repoRoot } = fixture();
  expect(writeWindowsSyncGroupProviderRelease({ repoRoot, status: 'consumer_complete' }))
    .toEqual({ action: 'multi-device-sync-a-rejoin', nonce,
      schemaVersion: 1, status: 'consumer_complete' });
  expect(JSON.parse(fs.readFileSync(paths.providerRelease, 'utf8')))
    .toMatchObject({ nonce, status: 'consumer_complete' });
  expect(fs.readdirSync(path.dirname(paths.providerRelease)).some((name) => name.endsWith('.tmp')))
    .toBe(false);
});

it('rejects release after the matching provider stopped', () => {
  const { repoRoot } = fixture('completed');
  expect(() => writeWindowsSyncGroupProviderRelease({ repoRoot, status: 'cancelled' }))
    .toThrow('not running');
});

it('routes a provider release directly to fixed SSH without pushing source', async () => {
  const executeGit = vi.fn();
  const executeSsh = vi.fn(async () => 'released\n');
  await expect(runWindowsDevControl({
    argv: ['multi-device-sync-provider-cancel'], env: transport.env, executeGit, executeSsh,
    fsApi: transport.fsApi,
    stdout: { write: vi.fn() }
  })).resolves.toMatchObject({ operation: 'provider-release' });
  expect(executeGit).not.toHaveBeenCalled();
  expect(executeSsh).toHaveBeenCalledOnce();
});

it('releases the provider before the remote build lock and source pull', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  expect(source.indexOf('$releaseRunner $releaseStatus')).toBeLessThan(
    source.indexOf('[System.IO.FileShare]::None')
  );
  expect(source.indexOf('$releaseRunner $releaseStatus')).toBeLessThan(
    source.indexOf('& $systemNode $puller')
  );
});
