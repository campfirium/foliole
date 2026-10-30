// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const host = vi.hoisted(() => ({ root: '', owner: 'macos', opens: 0, facts: 0,
  result: null, events: [], manualRuns: [], fault: null }));
vi.mock('./windows-multi-device-sync-readiness.mjs', () => ({ provisionWindowsAcceptanceRoot: () => {} }));
vi.mock('./windows-sync-group-recovery-action.mjs', () => ({
  waitForJoinedGroup: async () => ({ sync_group: group() }),
  windowsSyncGroupClientPaths: () => ({ libraryHome: path.join(host.root, 'client/library'),
    userData: path.join(host.root, 'client/user-data') }),
  openWindowsSyncGroupSession: async () => {
    host.opens += 1;
    host.result = host.opens === 1
      ? host.owner === 'windows' ? run('automatic', 'already-automatic') : run('initial', 'joined')
      : host.owner === 'windows' ? run('automatic', 'after') : run('manual', 'manual');
    return { app: { evaluate: async () => host.result }, page: {} };
  },
  invokeWindowsSyncGroupCommand: async (_page, command, args) => {
    if (command === 'complete_sync_group_join' || command === 'load_sync_group_overview') return { sync_group: group() };
    if (command === 'load_workspace_list_snapshot') return snapshot();
    if (command === 'load_node_document') return { nodeId: args.node_id,
      content: host.opens > 1 && host.fault === 'body' && args.node_id === 'C1' ? 'lost body' : `body-${args.node_id}` };
    if (command === 'sync_companion_now') {
      if (host.owner === 'macos') throw new Error('sync_group_peer_unavailable');
      host.manualRuns.unshift({ kind: 'run_finished', trigger_reason: 'manual', result: 'completed', status: 'completed',
        run_id: `manual-${host.manualRuns.length}`, started_at: 'start', occurred_at: 'finish' });
      return { sync_group: group() };
    }
    if (command === 'load_desktop_sync_diagnostics') return { activity: [...host.manualRuns, {
      kind: 'run_finished', trigger_reason: 'initial', result: 'completed', status: 'completed',
      run_id: 'joined', occurred_at: '2026-10-30T02:03:00Z', started_at: '2026-10-30T02:02:59Z'
    }] };
    return {};
  }
}));
vi.mock('../desktop/desktop-dnssd-route-observation.mjs', () => ({
  loadDesktopSyncRole: async () => ({ hasUpstream: host.owner === 'windows', hasDownstream: false })
}));
vi.mock('./windows-sync-group-session-close.mjs', () => ({
  closeWindowsSyncGroupSession: async () => { host.events.push('close'); }
}));
vi.mock('./windows-sync-group-provider-release.mjs', () => ({
  waitForWindowsSyncGroupProviderRelease: async () => { host.events.push('release'); }
}));
vi.mock('../desktop/sync-group-journey-fact-action.mjs', () => ({
  createDesktopSyncGroupJourneyFact: async () => {
    host.facts += 1;
    if (host.facts === 2 && host.owner === 'windows') host.result = run('automatic', 'before');
    return { factId: host.facts === 1 ? 'retired' : 'C1' };
  }
}));
vi.mock('../desktop/sync-group-conflict-action.mjs', () => ({ forkDesktopSyncConflict: async () => {} }));
vi.mock('../desktop/sync-group-controller-read.mjs', () => ({
  waitForSyncGroupAutomaticRun: async (read, previous) => {
    const value = await read();
    if (value?.reason !== 'automatic' || value.run_id === previous) throw new Error('Windows root has no outgoing automatic round');
    return value;
  }
}));
vi.mock('../acceptance/desktop-product-event.mjs', () => ({
  waitForDesktopProductEvent: async () => { throw new Error('Accepted join has no discovery-change event'); },
  waitForDesktopProductState: async (_page, args) => {
    if (args.condition.kind === 'body-alternative-preview' && host.owner === 'windows') host.result = run('automatic', 'resumed');
    return args.condition.kind === 'candidate-identity'
    ? { join_candidates: [{ group_id: group().group_id, group_tag: 'a'.repeat(32), endpoint_url: 'http://mac.test' }] }
    : args.condition.kind === 'sync-conflict-count' ? Promise.reject(new Error('Legacy conflict table is empty'))
      : args.condition.kind === 'body-alternative-preview' ? { source_node_id: 'conflict', alternatives: [{}],
        current_content: 'Cloze target alpha Note target beta Desktop fork macos',
        updated_content: 'Cloze target alpha Note target beta Desktop fork windows' } : snapshot();
  }
}));
import { runWindowsSinglePrincipalSyncGroup } from './windows-single-principal-sync-group-action.mjs';
function run(reason, run_id) { return { reason, run_id, status: 'completed' }; }
function group() { return { group_id: `group-${'a'.repeat(8)}-aaaa-aaaa-aaaa-${'a'.repeat(12)}`,
  local_device_identity_key: 'windows', devices: [{ device_identity_key: 'windows' }, { device_identity_key: 'macos' }] }; }
function snapshot() {
  const nodesById = { A1: { title: 'Multi-device sync A fact' }, A2: { title: 'Multi-device sync A fact' },
    C1: { title: 'Multi-device sync C fact' }, conflict: { id: 'conflict', title: 'T152 conflict t152-conflict-example' } };
  if (host.opens > 1 && host.fault === 'identity') {
    delete nodesById.A2;
    nodesById.unrelated = { title: 'Unrelated replacement' };
  }
  return { nodesById };
}
afterEach(() => { if (host.root) fs.rmSync(host.root, { recursive: true, force: true }); });
it.each(['macos', 'windows'])('finishes with %s owning automatic sync and keeps the restarted peer alive until released', async owner => {
  host.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-role-'));
  Object.assign(host, { owner, opens: 0, facts: 0, result: null, events: [], manualRuns: [], fault: null });
  await runWindowsSinglePrincipalSyncGroup({ paths: {}, evidenceRoot: host.root,
    expectedGroupId: group().group_id, expectedGroupTag: 'a'.repeat(32),
    reportProgress: value => host.events.push(value.milestone) });
  const receipt = JSON.parse(fs.readFileSync(path.join(host.root, 'single-principal-sync-group-receipt.json')));
  expect(receipt.runs.automaticBeforeRestart).toEqual(owner === 'windows' ? run('automatic', 'before') : null);
  expect(receipt.runs.automaticAfterRestart).toEqual(owner === 'windows' ? run('automatic', 'after') : null);
  expect(host.events.slice(-3)).toEqual(['restarted', 'release', 'close']);
  expect(receipt.runs.manualBeforeRestart).toEqual(owner === 'windows'
    ? { ...run('manual', 'manual-0'), error: null, started_at: 'start', finished_at: 'finish' } : null);
  expect(receipt.runs.manualAfterRestart).toEqual(owner === 'windows'
    ? { ...run('manual', 'manual-1'), error: null, started_at: 'start', finished_at: 'finish' } : null);
});

it.each(['missing', 'failed', 'automatic'])('rejects an initial activity without completed initial proof: %s', async kind => {
  const { completedInitialRun } = await import('./windows-single-principal-sync-group-contract.mjs');
  const activity = kind === 'missing' ? [] : [{ kind: 'run_finished', run_id: 'run',
    started_at: 'start', occurred_at: 'finish', status: kind === 'failed' ? 'failed' : 'completed',
    result: kind === 'failed' ? 'failed' : 'completed', trigger_reason: kind === 'automatic' ? 'automatic' : 'initial' }];
  expect(() => completedInitialRun(activity)).toThrow('initial sync did not complete');
});

it.each(['identity', 'body'])('rejects %s loss after restart despite an unchanged node count', async fault => {
  host.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-fact-loss-'));
  Object.assign(host, { owner: 'macos', opens: 0, facts: 0, result: null, events: [], manualRuns: [], fault });
  await expect(runWindowsSinglePrincipalSyncGroup({ paths: {}, evidenceRoot: host.root,
    expectedGroupId: group().group_id, expectedGroupTag: 'a'.repeat(32),
    reportProgress: () => {} })).rejects.toThrow('Journey facts changed');
});
