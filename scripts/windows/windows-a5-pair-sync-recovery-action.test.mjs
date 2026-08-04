// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { inspectWindowsPairSyncRecoveryDesktop } from './windows-a5-pair-sync-recovery-action.mjs';

const paths = { repoRoot: 'C:\\repo', systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
const execute = vi.fn(async () => ({ code: 0, output: '', stdout: '' }));

function unsafeSession(close = vi.fn(async () => undefined)) {
  return {
    close,
    load: vi.fn(async () => ({})),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: null, pairedDeviceFingerprints: [], pendingDeviceFingerprints: []
    }))
  };
}

it('preserves pairing approval evidence when bounded session cleanup also fails', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 77, stage: 'desktop-pairing-readiness' });
});

it('classifies a standalone bounded session cleanup failure', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  session.sanitize.mockReturnValue({
    desktopPeerFingerprint: 'fedcba9876543210', pairedDeviceFingerprints: [], pendingDeviceFingerprints: []
  });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-session-close' });
});

it('classifies a product pairing overview read failure without exposing its payload', async () => {
  const session = unsafeSession();
  session.load.mockRejectedValue(new Error('bridge read failed'));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-pairing-load' });
});
