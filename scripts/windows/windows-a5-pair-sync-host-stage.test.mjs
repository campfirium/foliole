// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { collectPairSyncHostStage } from './windows-a5-pair-sync-host-stage.mjs';

it('accepts only the current formal run stage from the test package', async () => {
  const execute = vi.fn(async () => ({
    code: 0, stdout: 'run-1\npair-request-awaiting\n'
  }));
  const args = {
    adbPort: '5037', buildIdentity: 'run-1', env: {}, execute,
    paths: { adbPath: 'adb.exe' }, serial: 'A5'
  };

  await expect(collectPairSyncHostStage(args)).resolves.toBe('pair-request-awaiting');
  await expect(collectPairSyncHostStage({ ...args, buildIdentity: 'run-2' }))
    .resolves.toBeNull();
  expect(execute.mock.calls[0][1]).toContain('files/foliole-pair-sync-stage.txt');
});
