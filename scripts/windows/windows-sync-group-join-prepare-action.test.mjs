// @vitest-environment node

import fs from 'node:fs';
import { expect, it, vi } from 'vitest';

import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';
import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import {
  runWindowsSyncGroupJoinPrepareAcceptance
} from './windows-sync-group-join-prepare-action.mjs';
import {
  copyWindowsSyncGroupJoinPrepareEvidence
} from './windows-sync-group-join-prepare-control.mjs';

it('registers one fixed Windows desktop join-prepare action without a legacy alias', () => {
  expect(parseWindowsDevControlArgs(['sync-group-join-prepare'], {}))
    .toMatchObject({ action: 'sync-group-join-prepare' });
  expect(toWindowsDevWireAction('sync-group-join-prepare')).toBe('sync-group-join-prepare');
  const build = fs.readFileSync('scripts/windows/windows-dev-build.mjs', 'utf8');
  expect(build).toContain('runWindowsSyncGroupJoinPrepareAcceptance');
  expect(build).toContain("['device-profile', 'sync-group-join-prepare']");
});

it('runs the shared hidden-native request and accept spec with fixed evidence', async () => {
  const execute = vi.fn(async () => ({ code: 0, output: 'passed\n' }));
  const paths = { repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js' };
  await expect(runWindowsSyncGroupJoinPrepareAcceptance(
    'sync-group-join-prepare', execute, paths, 'D:\\evidence'
  )).resolves.toMatchObject({ evidence: {
    resultStatus: 'passed', spec: 'tests/desktop/sync-group-join-prepare.spec.ts'
  } });
  expect(execute).toHaveBeenCalledWith('node.exe', [
    'npm-cli.js', 'run', 'test:e2e:desktop:native:hidden', '--',
    'tests/desktop/sync-group-join-prepare.spec.ts'
  ], expect.objectContaining({ cwd: 'D:\\C\\foliole', env: expect.objectContaining({
    FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1',
    FOLIOLE_SYNC_GROUP_JOIN_PREPARE_EVIDENCE_ROOT: 'D:\\evidence'
  }), windowsHide: true }));
});

it('does not claim unrelated Windows actions', async () => {
  await expect(runWindowsSyncGroupJoinPrepareAcceptance(
    'build', vi.fn(), {}, 'D:\\evidence'
  )).resolves.toBeNull();
});

it('copies only the bounded Windows receipt and screenshot evidence', async () => {
  const copyFile = vi.fn(async () => {});
  const fsApi = { mkdirSync: vi.fn() };
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1';
  const result = await copyWindowsSyncGroupJoinPrepareEvidence({
    action: 'sync-group-join-prepare', copyFile, fsApi, remoteError: null,
    remoteOutput: `[windows-dev-action] status: OK exit=0 evidence=${remoteRoot}/summary.json\n`,
    repoRoot: '/repo'
  });
  expect(copyFile).toHaveBeenCalledTimes(4);
  expect(result.manifestPath).toContain('sync-group-join-prepare-receipt.json');
});
