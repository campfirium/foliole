// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ session: null, provider: null, created: 0 }));
vi.mock('node:child_process', () => ({ execFile: (_command, _args, _options, callback) =>
  callback(null, { stdout: 'a'.repeat(40), stderr: '' }) }));
vi.mock('../android/macos-sync-group-desktop-session.mjs', () => ({
  openMacosSyncGroupDesktopSession: async () => host.session,
  waitForMacosDeviceRequest: async () => ({ request_id: 'request' }),
  waitForMacosAutomaticRun: async () => { throw new Error('Anchor must not poll its members'); }
}));
vi.mock('../sync-group/multi-device-sync-action-executor.mjs', () => ({ createActionExecutor: () => vi.fn() }));
vi.mock('../sync-group/multi-device-sync-windows-provider.mjs', () => ({
  startWindowsSyncGroupProvider: () => host.provider
}));
vi.mock('../desktop/sync-group-journey-fact-action.mjs', () => ({
  createDesktopSyncGroupJourneyFact: async () => ({ factId: `A${++host.created}` })
}));
vi.mock('../desktop/sync-group-conflict-action.mjs', () => ({
  createDesktopSyncConflictSeed: async () => ({ nodeId: 'conflict' }),
  forkDesktopSyncConflict: async () => {}
}));
vi.mock('./macos-joins-windows-sync-group.mjs', () => ({ runMacosJoinsWindowsSyncGroup: vi.fn() }));

import { runMacosWindowsSinglePrincipalSyncGroup } from './macos-windows-single-principal-sync-group.mjs';
import { waitForAutomaticSync } from './windows-single-principal-sync-group-action.mjs';

let root;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

function currentHosts() {
  host.created = 0;
  const group = { group_id: 'group-test', local_device_identity_key: 'mac', devices: ['mac', 'windows'] };
  const snapshot = { nodesById: { A1: {}, A2: {}, C1: {} } };
  host.session = {
    enable: async () => ({ sync_group: group, server_status: { port: 38643 } }),
    accept: async () => ({ sync_group: group }), load: async () => ({ sync_group: group }),
    loadSyncTriggerResult: async () => null, close: vi.fn(async () => {}),
    invoke: async command => command === 'load_workspace_list_snapshot' ? snapshot
      : { run_id: 'manual', reason: 'manual', status: 'completed' },
    waitForState: vi.fn(async args => {
      if (args.condition.kind === 'sync-conflict-count') return [{ objectId: 'conflict' }];
      if (args.condition.counts?.['Multi-device sync C fact'] > 1) {
        throw new Error('Use Group replaced the pre-join C fact; only the new fact is valid');
      }
      return snapshot;
    })
  };
  host.provider = {
    waitForProgress: vi.fn(async () => {}), release: vi.fn(async () => {}),
    cancelAndSettle: vi.fn(async () => {}),
    finish: async () => ({ evidenceRef: '/windows/receipt.json', receipt: {
      resultStatus: 'success', localDevicePersisted: true,
      automaticFactId: 'C1', journeyFactId: 'retired-C', localDeviceIdentityKey: 'windows',
      runs: { automaticBeforeRestart: { reason: 'automatic', status: 'completed' } }
    } })
  };
}

it('accepts post-join two-way facts while the anchor remains passive and the old local fact is replaced', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-current-contract-'));
  currentHosts();
  const result = await runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root });
  expect(result.receipt).toMatchObject({ resultStatus: 'success', idempotent: true, macosRestarted: true });
  expect(result.receipt.runs.macos).toMatchObject({ automaticBeforeRestart: null, automaticAfterRestart: null });
  expect(host.provider.cancelAndSettle).not.toHaveBeenCalled();
  expect(host.provider.release).toHaveBeenCalledWith('consumer_complete');
});

it('observes an outgoing-only automatic completion without requiring an incoming workspace event', async () => {
  const app = { evaluate: vi.fn().mockResolvedValueOnce({ run_id: 'old', reason: 'initial', status: 'completed' })
    .mockResolvedValue({ run_id: 'new', reason: 'automatic', status: 'completed' }) };
  const page = { evaluate: vi.fn(async () => { throw new Error('No incoming apply event for outgoing-only sync'); }) };
  await expect(waitForAutomaticSync({ app, page }, 'old', 2000)).resolves.toMatchObject({ run_id: 'new' });
  expect(page.evaluate).not.toHaveBeenCalled();
});
