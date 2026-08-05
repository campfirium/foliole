// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  collectPairSyncRecoveryFailureEvidence, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW,
  PAIR_SYNC_FAILURE_SCREENSHOT
} from './windows-a5-pair-sync-recovery-failure-evidence.mjs';

it('captures the fixed A5 screen and current Windows pairing overview after recovery fails', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-sync-failure-'));
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('pull')) fs.writeFileSync(args.at(-1), 'png');
    return { code: 0, output: '', stdout: '' };
  });
  const session = {
    load: vi.fn(async () => ({ paired_devices: [], pending_requests: [] })),
    sanitize: vi.fn(() => ({
      pairedDeviceFingerprints: [], pendingDeviceFingerprints: []
    }))
  };
  const evidence = await collectPairSyncRecoveryFailureEvidence({
    adbPort: '5037', env: {}, evidenceRoot, execute, fsApi: fs,
    paths: { adbPath: 'adb.exe' }, serial: '87a33a4b', session
  });
  expect(evidence).toEqual({
    desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW,
    screenshot: PAIR_SYNC_FAILURE_SCREENSHOT
  });
  expect(execute.mock.calls.every(([, args]) => args.slice(0, 4).join(' ') === '-P 5037 -s 87a33a4b')).toBe(true);
  expect(fs.existsSync(path.join(evidenceRoot, PAIR_SYNC_FAILURE_SCREENSHOT))).toBe(true);
  expect(JSON.parse(fs.readFileSync(
    path.join(evidenceRoot, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW), 'utf8'
  ))).toEqual({ pairedDeviceFingerprints: [], pendingDeviceFingerprints: [] });
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
});

it('keeps available Windows state when screenshot capture fails', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-sync-failure-partial-'));
  const evidence = await collectPairSyncRecoveryFailureEvidence({
    adbPort: '5037', env: {}, evidenceRoot,
    execute: vi.fn(async () => ({ code: 1, output: '', stderr: 'capture failed' })), fsApi: fs,
    paths: { adbPath: 'adb.exe' }, serial: '87a33a4b',
    session: { load: vi.fn(async () => ({})), sanitize: vi.fn(() => ({ pairedDeviceFingerprints: [] })) }
  });
  expect(evidence).toEqual({ desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW });
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
});
