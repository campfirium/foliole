// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { afterEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ session: null, provider: null, created: 0 }));
vi.mock('node:child_process', () => ({ execFile: (_command, _args, _options, callback) =>
  callback(null, { stdout: 'a'.repeat(40), stderr: '' }) }));
vi.mock('../android/macos-sync-group-desktop-session.mjs', () => ({
  openMacosSyncGroupDesktopSession: async () => host.session,
  waitForMacosDeviceRequest: async () => ({ request_id: 'request' }),
  waitForMacosAutomaticRun: async (session, previous) => {
    const run = await session.loadSyncTriggerResult();
    if (run?.run_id === previous || run?.reason !== 'automatic' || run?.status !== 'completed') {
      throw new Error('No new completed automatic round after restart');
    }
    return run;
  }
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
import { loadSyncTriggerResult, waitForAutomaticSync } from './windows-single-principal-sync-group-action.mjs';

let root;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

function currentHosts() {
  host.created = 0;
  const group = { group_id: 'group-test', local_device_identity_key: 'mac', devices: ['mac', 'windows'] };
  const snapshot = { nodesById: { A1: {}, A2: {}, C1: {} } };
  const activity = [];
  host.session = {
    enable: async () => ({ sync_group: group, server_status: { port: 38643 } }),
    accept: async () => ({ sync_group: group }), load: async () => ({ sync_group: group }),
    loadSyncRole: async () => ({ hasUpstream: true, hasDownstream: false }),
    loadSyncTriggerResult: async () => null, close: vi.fn(async () => {}),
    invoke: async command => {
      if (command === 'load_workspace_list_snapshot') return snapshot;
      if (command === 'load_desktop_sync_diagnostics') return { activity: [...activity] };
      if (command === 'sync_companion_now') activity.unshift({ kind: 'run_finished',
        trigger_reason: 'manual', status: 'completed', result: 'completed',
        run_id: `manual-${activity.length}`, started_at: 'start', occurred_at: 'finish' });
      return { sync_group: group };
    },
    waitForState: vi.fn(async args => {
      if (args.condition.kind === 'sync-conflict-count') throw new Error('Legacy conflict table is empty');
      if (args.condition.kind === 'body-alternative-preview') return { alternatives: [{}], source_node_id: 'conflict',
        current_content: 'Cloze target alpha Note target beta Desktop fork macos',
        updated_content: 'Cloze target alpha Note target beta Desktop fork windows' };
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
      runs: { automaticBeforeRestart: { run_id: 'win-before', reason: 'automatic', status: 'completed' },
        automaticAfterRestart: { run_id: 'win-after', reason: 'automatic', status: 'completed' },
        manualBeforeRestart: { run_id: 'win-manual-before', reason: 'manual', status: 'completed' },
        manualAfterRestart: { run_id: 'win-manual-after', reason: 'manual', status: 'completed' } }
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
  await expect(waitForAutomaticSync({ app, page }, 'old', { timeoutMs: 2000 })).resolves.toMatchObject({ run_id: 'new' });
  expect(page.evaluate).not.toHaveBeenCalled();
});

it('reads the completion receipt through the native database owner during synchronization', async () => {
  let owned = false;
  const receipt = { run_id: 'finished', reason: 'automatic', status: 'completed' };
  const modules = {
    '/runtime/database/connection.js': { runWithDatabaseConnectionOwner: async action => {
      owned = true;
      try { return await action(); } finally { owned = false; }
    } },
    '/runtime/sync/desktopSyncCoordinator.js': { loadActiveDesktopSyncRun: () => null, loadDesktopSyncTriggerResult: () => {
      if (!owned) throw new TypeError('This database connection is busy executing a query');
      return receipt;
    } }
  };
  const getBuiltin = process.getBuiltinModule.bind(process);
  vi.spyOn(process, 'getBuiltinModule').mockImplementation(name => name === 'node:module'
    ? { createRequire: () => file => modules[file.split(path.sep).join('/')] } : getBuiltin(name));
  const app = { evaluate: action => action({ app: { getAppPath: () => '/runtime' } }) };
  await expect(loadSyncTriggerResult(app)).resolves.toEqual(receipt);
  expect(owned).toBe(false);
});

const automatic = run_id => ({ run_id, reason: 'automatic', status: 'completed' });

it('accepts Mac-owned automatic rounds and keeps Windows available through the Mac restart', async () => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-mac-owned-'));
  currentHosts();
  host.session.loadSyncTriggerResult = vi.fn().mockResolvedValueOnce(automatic('mac-before'))
    .mockResolvedValueOnce(automatic('mac-resumed')).mockResolvedValueOnce(automatic('mac-before-close')).mockResolvedValue(automatic('mac-after'));
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs = { automaticBeforeRestart: null, automaticAfterRestart: null };
    return result;
  };
  const result = await runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root });
  expect(result.receipt.runs.macos).toMatchObject({
    automaticBeforeRestart: automatic('mac-before'), automaticAfterRestart: automatic('mac-after')
  });
  expect(host.provider.release).toHaveBeenCalledTimes(2);
});

it('rejects converged facts without any completed automatic round', async () => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-no-automatic-'));
  currentHosts();
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs = { automaticBeforeRestart: null, automaticAfterRestart: null };
    return result;
  };
  await expect(runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root }))
    .rejects.toThrow('completed automatic');
});

it.each(['manual', 'stale'])('rejects %s evidence in place of a new post-restart automatic round', async kind => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-invalid-restart-'));
  currentHosts();
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs.automaticAfterRestart = kind === 'manual'
      ? { run_id: 'manual-after', reason: 'manual', status: 'completed' }
      : result.receipt.runs.automaticBeforeRestart;
    return result;
  };
  await expect(runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root }))
    .rejects.toThrow('automaticAfterRestart');
});

it('does not count a public no-peer result as manual completion on the root', async () => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-root-manual-'));
  currentHosts();
  host.session.loadSyncRole = async () => ({ hasUpstream: false, hasDownstream: false });
  const invoke = host.session.invoke;
  host.session.invoke = async command => {
    if (command === 'sync_companion_now') throw new Error('sync_group_peer_unavailable');
    return invoke(command);
  };
  const result = await runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root });
  expect(result.receipt.runs.macos.manualBeforeRestart).toBeNull();
  expect(result.receipt.runs.macos.manualAfterRestart).toBeNull();
});

it.each(['manualBeforeRestart', 'manualAfterRestart'])('rejects missing completed manual evidence for %s', async phase => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-no-manual-'));
  currentHosts();
  const invoke = host.session.invoke;
  host.session.invoke = command => command === 'sync_companion_now'
    ? Promise.reject(new Error('sync_group_peer_unavailable')) : invoke(command);
  host.session.loadSyncRole = async () => ({ hasUpstream: false, hasDownstream: false });
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs[phase] = null;
    return result;
  };
  await expect(runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root })).rejects.toThrow(phase);
});

it('retains a completed automatic round when a later skipped attempt replaces the last result', async () => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-overwritten-automatic-'));
  currentHosts();
  host.session.loadSyncTriggerResult = vi.fn().mockResolvedValueOnce({
    reason: 'automatic', status: 'skipped', run_id: 'skipped'
  }).mockResolvedValueOnce(automatic('resumed')).mockResolvedValueOnce(automatic('before-close')).mockResolvedValue(automatic('after'));
  const invoke = host.session.invoke;
  host.session.invoke = async command => command === 'load_desktop_sync_diagnostics'
    ? { activity: [...(await invoke(command)).activity, { kind: 'run_finished', trigger_reason: 'automatic', status: 'completed',
      result: 'completed', run_id: 'saved-before', started_at: '2026-10-30T03:15:21Z',
      occurred_at: '2026-10-30T03:15:22Z' }] } : invoke(command);
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs.automaticBeforeRestart = null;
    result.receipt.runs.automaticAfterRestart = null;
    return result;
  };
  const result = await runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root });
  expect(result.receipt.runs.macos.automaticBeforeRestart.run_id).toBe('saved-before');
  expect(result.receipt.runs.macos.automaticAfterRestart.run_id).toBe('after');
});

it('waits for resumed automatic completion before attempting manual sync after conflict', async () => {
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-resumed-manual-'));
  currentHosts();
  let reads = 0;
  host.session.loadSyncTriggerResult = async () => automatic(++reads === 1 ? 'before' : `resumed-${reads}`);
  host.session.loadSyncRole = async () => ({ hasUpstream: reads > 1, hasDownstream: false });
  const finish = host.provider.finish;
  host.provider.finish = async () => {
    const result = await finish();
    result.receipt.runs.manualBeforeRestart = null;
    result.receipt.runs.manualAfterRestart = null;
    return result;
  };
  const result = await runMacosWindowsSinglePrincipalSyncGroup({ repoRoot: root });
  expect(result.receipt.runs.macos.manualBeforeRestart.status).toBe('completed');
});
