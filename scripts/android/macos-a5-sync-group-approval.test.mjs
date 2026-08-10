import { expect, it } from 'vitest';

import {
  installedMainMatches,
  parseSyncGroupApprovalReceipt,
  startMacosA5SyncGroupApprovalProvider
} from './macos-a5-sync-group-approval.mjs';

it('reuses an installed main APK only when its SHA-256 matches exactly', async () => {
  const execute = async (_command, args) => {
    if (args.includes('path')) return { code: 0, stdout: 'package:/data/app/foliole/base.apk\n' };
    return { code: 0, stdout: 'abc123  /data/app/foliole/base.apk\n' };
  };

  await expect(installedMainMatches({
    env: {}, execute, localHash: 'abc123', paths: { adb: 'adb', apk: '/repo/app.apk' }
  })).resolves.toBe(true);
  await expect(installedMainMatches({
    env: {}, execute, localHash: 'different', paths: { adb: 'adb', apk: '/repo/app.apk' }
  })).resolves.toBe(false);
});

it('keeps bounded instrumentation failure evidence', () => {
  const lines = Array.from({ length: 40 }, (_, index) => `line-${index + 1}`);
  expect(() => parseSyncGroupApprovalReceipt(lines.join('\n'))).toThrow(
    /line-17.*line-40/u
  );
});

it('accepts the complete approval receipt', () => {
  const receipt = {
    approved: true, foreground: true, ok: true, targetTestId: 'sync-group-approval'
  };
  expect(parseSyncGroupApprovalReceipt(
    `INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=${JSON.stringify(receipt)}\nINSTRUMENTATION_CODE: -1`
  )).toEqual(receipt);
});

it('starts the peer only after the A5 product surface is stable', async () => {
  const order = [];
  const execute = async (_command, args) => {
    order.push(args.some((arg) => arg.endsWith('verify-android-launch.mjs')) ? 'stable' : 'started');
    return { code: 0, output: '' };
  };
  await startMacosA5SyncGroupApprovalProvider({
    env: {}, execute, onReady: async () => { order.push('peer'); },
    paths: { adb: 'adb', repoRoot: '/repo' }
  });
  expect(order).toEqual(['started', 'stable', 'peer']);
});
