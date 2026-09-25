import { gzipSync } from 'node:zlib';

import { beforeEach, expect, it, vi } from 'vitest';

const completion = { batchId: 'batch', completedAt: 'done', sourceHost: 'Mac', startedAt: 'start' };
const cutover = { annotations: [], batchId: 'batch', cohortDocumentIds: [],
  completedAt: 'done', completionVersion: 7, documents: [], phase: null,
  retiredNodeIds: [], sourceHost: 'Mac', startedAt: 'start', status: 'api', version: 2 };
const state = vi.hoisted(() => ({
  autoOwner: false, localMode: 'api' as 'api' | 'relay', localReady: true,
  owner: null as string | null,
  remoteMode: 'api' as 'api' | 'relay', remoteReady: true, reachable: true
}));
const calls = vi.hoisted(() => ({ activate: vi.fn(), post: vi.fn(), write: vi.fn() }));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { transaction: (run: (driver: unknown) => unknown) => run({}) } }),
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canPrepareReadwiseOnThisHost: () => state.localReady,
  loadReadwiseHostAssignment: () => ({ legacy_unassigned: state.owner === null,
    active_device_identity_key: state.owner, is_active: state.owner === 'mac' })
}));
vi.mock('../database/readwiseSourceMode.js', () => ({
  loadReadwiseSourceModeState: () => ({ mode: state.localMode, conflictReasons: [],
    completion: state.localMode === 'api' ? completion : null })
}));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: (key: string) => key === 'readwise_active_host'
    ? state.owner === null ? null : { selection_source: state.autoOwner ? 'automatic' : 'chosen' }
    : cutover,
  writeJsonSetting: (...args: unknown[]) => {
    calls.write(...args);
    if (args[1] === 'readwise_source_mode') state.localMode = 'api';
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group', local_device_identity_key: 'mac',
    devices: [
      { device_identity_key: 'mac', device_name: 'Mac Mini', platform: 'macOS', state: 'active' },
      { device_identity_key: 'win', device_name: 'Windows PC', platform: 'Windows 11', state: 'active' }
    ] })
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  loadDesktopSyncGroupMemberEndpoints: () => state.reachable ? [{
    endpoint_url: 'http://win', group_id: 'group', local_device_id: 'mac',
    peer_device_id: 'win', peer_device_name: 'Windows PC', peer_platform: 'Windows 11'
  }] : []
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: async () => undefined
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  postDesktopWorkgroupJson: async (request: { body: string }) => {
    const body = JSON.parse(request.body) as { action: string };
    calls.post(body.action);
    if (body.action === 'adopt-api') state.remoteMode = 'api';
    return body.action === 'activate' ? { is_active: true } : {
      deviceId: 'win', deviceName: 'Windows PC', mode: state.remoteMode,
      ready: state.remoteReady, apiProof: state.remoteMode === 'api'
        ? { completion, cutover } : null
    };
  }
}));
vi.mock('./readwiseOwnerHandoff.js', () => ({
  activateReadwiseWithHandoff: async (options: unknown) => {
    calls.activate(options); return { is_active: true };
  }
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'secret' })
}));

import { handleReadwiseGroupSetup, resolveReadwiseJoinDecision } from './readwiseGroupSetup.js';

beforeEach(() => {
  state.localMode = 'api'; state.localReady = true; state.owner = null;
  state.autoOwner = false;
  state.remoteMode = 'api'; state.remoteReady = true; state.reachable = true;
  Object.values(calls).forEach((call) => call.mockReset());
});

it('asks for a device when both desktops have usable API connections', async () => {
  await expect(resolveReadwiseJoinDecision()).resolves.toEqual({
    kind: 'choose', devices: [
      { device_id: 'mac', device_name: 'Mac Mini' },
      { device_id: 'win', device_name: 'Windows PC' }
    ]
  });
  expect(calls.activate).not.toHaveBeenCalled();
});

it('asks for a device when both desktops have usable relay connections', async () => {
  state.localMode = 'relay'; state.remoteMode = 'relay';
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'choose' });
  expect(calls.activate).not.toHaveBeenCalled();
});

it('adopts completed API mode before activating the only connected API desktop', async () => {
  state.remoteMode = 'relay'; state.remoteReady = false;
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'switching' });
  expect(calls.post.mock.calls.map((call) => call[0])).toEqual(['inspect', 'adopt-api']);
  expect(calls.activate).toHaveBeenCalledOnce();
});

it('keeps an existing import device and waits when a known peer is offline', async () => {
  state.owner = 'mac';
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'none' });
  state.reachable = false;
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'none' });
  state.owner = null; state.reachable = false;
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'waiting' });
  expect(calls.activate).not.toHaveBeenCalled();
});

it('asks when a second capable desktop joins an automatically assigned owner', async () => {
  state.owner = 'mac'; state.autoOwner = true;
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'choose' });
  expect(calls.activate).not.toHaveBeenCalled();
});

it('does not restart an already active automatic owner when another device retries', async () => {
  state.owner = 'mac'; state.autoOwner = true;
  await handleReadwiseGroupSetup(JSON.stringify({ action: 'activate', automatic: true }), 'win');
  expect(calls.activate).toHaveBeenCalledWith({
    forceCurrent: false, selectionSource: 'automatic'
  });
});

it('requires a completed migration proof before replacing relay mode', async () => {
  state.localMode = 'relay';
  const invalid = { completion, cutover: { ...cutover, completionVersion: 2 } };
  await expect(handleReadwiseGroupSetup(JSON.stringify({ action: 'adopt-api',
    proofGzip: gzipSync(JSON.stringify(invalid)).toString('base64') }), 'win'))
    .rejects.toThrow('readwise_api_proof_invalid');
  expect(calls.write).not.toHaveBeenCalled();
  await expect(handleReadwiseGroupSetup(JSON.stringify({
    action: 'adopt-api', proofGzip: gzipSync(JSON.stringify({ completion, cutover })).toString('base64')
  }), 'win')).resolves.toMatchObject({ mode: 'api' });
  expect(calls.write.mock.calls.map((call) => call[1])).toEqual([
    'readwise_source_cutover_v2', 'readwise_source_mode', 'readwise_source_mode_conflict'
  ]);
});
