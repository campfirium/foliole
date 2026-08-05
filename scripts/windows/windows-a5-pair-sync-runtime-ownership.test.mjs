// @vitest-environment node

import { Buffer } from 'node:buffer';

import { expect, it, vi } from 'vitest';

import { runWindowsA5PairSyncRecovery } from './windows-a5-pair-sync-recovery-action.mjs';

const fixedPaths = {
  adbPath: 'adb.exe', repoRoot: 'C:\\repo', systemNode: 'node.exe'
};

function fixture({ assertActive = vi.fn(), enableResult, reverseFails = false }) {
  const calls = [];
  const fsApi = {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((_filePath, encoding) => encoding === 'utf8'
      ? JSON.stringify({ backupCreated: true, databasePreserved: true, schemaVersion: 1 })
      : Buffer.from('apk')),
    statSync: vi.fn(() => ({ size: 3 })), unlinkSync: vi.fn(), writeFileSync: vi.fn()
  };
  const execute = vi.fn(async (_command, args) => {
    const operation = args.includes('reverse')
      ? (args.includes('--remove') ? 'reverse-close' : 'reverse-open')
      : (args.includes('instrument') ? 'instrument' : 'other');
    calls.push(operation);
    if (reverseFails && operation === 'reverse-open') throw new Error('fixed route unavailable');
    return { code: 0, lines: [], output: '', stdout: 'Success\n' };
  });
  const session = {
    approve: vi.fn(), assertActive, close: vi.fn(async () => undefined),
    enable: vi.fn(async () => enableResult),
    load: vi.fn(async () => ({ paired_devices: [], pending_requests: [] })),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: 'desktop-peer', pairedDeviceFingerprints: [],
      pendingDeviceFingerprints: []
    }))
  };
  return { calls, execute, fsApi, session };
}

async function runFailure(testFixture) {
  return runWindowsA5PairSyncRecovery({
    adbPort: '5037', buildIdentity: 'pair-ownership',
    deviceFingerprint: '0123456789abcdef', env: {}, evidenceRoot: 'C:\\evidence',
    execute: testFixture.execute, fsApi: testFixture.fsApi,
    openDesktopSession: vi.fn(async () => testFixture.session), paths: fixedPaths,
    protectData: vi.fn(async () => ({ output: '' })), serial: '87a33a4b'
  }).catch((error) => error);
}

it.each([
  [{ port: 38641, state: 'stopped' }],
  [{ port: 38642, state: 'running' }]
])('rejects listener ownership before reverse and instrumentation for %o', async (serverStatus) => {
  const testFixture = fixture({
    enableResult: { server_status: serverStatus, sync_enabled: true }
  });
  await expect(runFailure(testFixture)).resolves.toMatchObject({ stage: 'desktop-runtime-ownership' });
  expect(testFixture.calls).not.toContain('reverse-open');
  expect(testFixture.calls).not.toContain('instrument');
});

it('does not start instrumentation when the fixed reverse cannot be established', async () => {
  const testFixture = fixture({
    enableResult: { server_status: { port: 38641, state: 'running' }, sync_enabled: true },
    reverseFails: true
  });
  await expect(runFailure(testFixture)).resolves.toMatchObject({ stage: 'pair-sync-transport-open' });
  expect(testFixture.calls).toContain('reverse-open');
  expect(testFixture.calls).not.toContain('instrument');
  expect(testFixture.calls).not.toContain('reverse-close');
});

it('cleans the owned reverse when the current session ends before instrumentation', async () => {
  const assertActive = vi.fn()
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => { throw new Error('session ended'); });
  const testFixture = fixture({
    assertActive,
    enableResult: { server_status: { port: 38641, state: 'running' }, sync_enabled: true }
  });
  await expect(runFailure(testFixture)).resolves.toMatchObject({ stage: 'desktop-runtime-ownership' });
  expect(testFixture.calls).toContain('reverse-open');
  expect(testFixture.calls).toContain('reverse-close');
  expect(testFixture.calls).not.toContain('instrument');
  expect(testFixture.session.close).toHaveBeenCalledOnce();
});
