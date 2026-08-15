// @vitest-environment node

import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

import {
  inspectSyncGroupOutboundPreferences
} from './android-pair-sync-recovery-readiness-runner.mjs';

const options = { adb: 'adb', appId: 'app', serial: 'a5' };

it('hashes Sync Group outbound peer ownership instead of treating legacy pairing as group authority', async () => {
  const peer = 'desktop-device-1';
  const run = vi.fn(async (_command, args) => ({
    stdout: String(args.at(-1)).includes('grep -c')
      ? '1\n' : `${createHash('sha256').update(peer).digest('hex')}  -\n`
  }));
  const result = await inspectSyncGroupOutboundPreferences(options, run);
  expect(result).toEqual({
    syncGroupCredentialsPresent: true,
    syncGroupPeerConflict: false,
    syncGroupRemotePeerFingerprint: createHash('sha256').update(peer).digest('hex').slice(0, 16)
  });
  expect(JSON.stringify(result)).not.toContain(peer);
  expect(run.mock.calls.some(([, args]) => args.includes('sh'))).toBe(true);
  expect(run.mock.calls[0][1].at(-1)).toContain('foliole_sync_group_outbound_peers.xml.bak');
  expect(run.mock.calls[1][1].at(-1)).toContain("tr -d '\\\\n'");
});

it('reports an absent Sync Group outbound credential independently of legacy pairing', async () => {
  const run = vi.fn(async () => ({ stdout: '0\n' }));
  await expect(inspectSyncGroupOutboundPreferences(options, run)).resolves.toEqual({
    syncGroupCredentialsPresent: false,
    syncGroupPeerConflict: false,
    syncGroupRemotePeerFingerprint: null
  });
});
