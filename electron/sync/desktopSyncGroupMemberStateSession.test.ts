// @vitest-environment node
// Exercise discovery ordering without touching a live library.
import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';


const state = vi.hoisted(() => ({
  callbacks: null as null | {
    onStarted(): void;
    onService(event: DesktopDnsSdServiceChange): void;
    onError(error: Error): void;
  },
  exchange: vi.fn(async (): Promise<void> => undefined)
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  loadDesktopSyncGroupMemberState: vi.fn()
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => null, saveJsonSetting: vi.fn()
}));
vi.mock('./desktopDnsSdRecoverySession.js', () => ({
  startRecoverableDesktopDnsSdSession: (callbacks: NonNullable<typeof state.callbacks>) => {
    state.callbacks = callbacks;
    callbacks.onStarted();
    return { stop: vi.fn(), recover: vi.fn() };
  }
}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: state.exchange,
  publishDesktopSyncGroupMemberState: vi.fn()
}));

import type { DesktopDnsSdServiceChange } from './desktopDnsSd.js';
import {
  loadDesktopSyncGroupMemberEndpoints,
  startDesktopSyncGroupMemberStateSession
} from './desktopSyncGroupMemberStateSession.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import {
  clearDesktopSyncGroupRoutes, loadDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute, saveDesktopSyncGroupRoute
} from './desktopSyncGroupRoutes.js';

const group = { group_id: 'test-group', local_device_identity_key: 'mac',
  created_at: '2026-09-27', devices: [], display_name: 'Test' };
let session: ReturnType<typeof startDesktopSyncGroupMemberStateSession>;
let role = 'member';
const activate = vi.fn(async (peer: DesktopSyncGroupPeer) => {
  saveDesktopSyncGroupRoute({ ...peer, route_kind: 'member' });
  return true;
});

function service(runtimeId: string, advertisedRole = 'member'): DesktopDnsSdService {
  const name = `Diagnostic-${runtimeId}-${advertisedRole}`;
  return {
    domain: 'local.', host: 'windows.local.', type: '_foliole-sync._tcp',
    name, fqdn: `${name}._foliole-sync._tcp.local.`, interfaceIndex: 1,
    addresses: ['192.0.2.10'], port: 38641,
    txt: { group_id: group.group_id, device_id: 'windows',
      runtime_instance_id: runtimeId, topology_role: advertisedRole }
  };
}

async function emit(kind: DesktopDnsSdServiceChange['kind'], value: ReturnType<typeof service>) {
  state.callbacks?.onService({ kind, service: value });
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

beforeEach(() => {
  clearDesktopSyncGroupRoutes();
  vi.clearAllMocks();
  role = 'member';
  state.exchange.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({
      group_id: group.group_id, provider_device_id: 'windows',
      provider_device_name: 'Windows', provider_platform: 'Windows 11',
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, topology_role: role
    })
  })));
  session = startDesktopSyncGroupMemberStateSession(
    group, vi.fn(), activate, removeDesktopSyncGroupRoute
  );
});

afterEach(() => {
  session.stop();
  clearDesktopSyncGroupRoutes();
  vi.unstubAllGlobals();
});

it('normal departure before replacement preserves the new member route', async () => {
  await emit('found', service('old'));
  await emit('lost', service('old'));
  await emit('found', service('new'));
  expect.soft(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(1);
  expect.soft(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
});

it('delayed loss of the old runtime must preserve a reachable replacement', async () => {
  await emit('found', service('old'));
  await emit('found', service('new'));
  expect.soft(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
  await emit('lost', service('old'));
  expect.soft(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(1);
  expect.soft(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
});

it('member announcement during an older probe must eventually activate collection', async () => {
  let finishExchange!: () => void;
  state.exchange.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finishExchange = resolve;
  }));
  role = 'observing';
  await emit('found', service('new', 'observing'));
  expect(state.exchange).toHaveBeenCalledOnce();
  role = 'member';
  await emit('found', service('new', 'member'));
  finishExchange();
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
  expect(activate).toHaveBeenCalledOnce();
});

it('member announcement after the observing probe activates collection', async () => {
  role = 'observing';
  await emit('found', service('new', 'observing'));
  role = 'member';
  await emit('found', service('new', 'member'));
  expect(activate).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
});

it('keeps a member reachable when one of its network interfaces disappears', async () => {
  await emit('found', service('same'));
  const otherInterface = { ...service('same'), interfaceIndex: 2 };
  await emit('found', otherInterface);
  await emit('lost', otherInterface);
  expect(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
  await emit('lost', service('same'));
  expect(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(0);
  expect(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(0);
});

it('cannot restore a departed member when its pending exchange completes', async () => {
  let finish!: () => void;
  state.exchange.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await emit('found', service('gone'));
  await emit('lost', service('gone'));
  finish();
  await emit('lost', service('gone'));
  expect(activate).not.toHaveBeenCalled();
  expect(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(0);
});

it('coalesces overlapping announcements and activates the latest endpoint after failure', async () => {
  let fail!: (error: Error) => void;
  state.exchange.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  await emit('found', service('old'));
  await emit('found', { ...service('middle'), port: 38642 });
  await emit('found', { ...service('latest'), port: 38643 });
  expect(state.exchange).toHaveBeenCalledOnce();
  fail(new Error('Old endpoint disconnected'));
  await emit('lost', service('old'));
  expect(state.exchange).toHaveBeenCalledTimes(2);
  expect(activate).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes(group.group_id)[0]?.endpoint_url).toBe('http://192.0.2.10:38643');
});

it('ignores old completion after discovery recovery and consumes the new announcement', async () => {
  let finish!: () => void;
  state.exchange.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await emit('found', service('old'));
  state.callbacks?.onError(new Error('Discovery interrupted'));
  state.callbacks?.onStarted();
  await emit('found', service('new'));
  finish();
  await emit('lost', service('old'));
  expect(activate).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
});

it('does not activate pending announcements after stop', async () => {
  let finish!: () => void;
  state.exchange.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await emit('found', service('old'));
  await emit('found', service('new'));
  session.stop();
  finish();
  await emit('found', service('late'));
  expect(activate).not.toHaveBeenCalled();
  expect(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(0);
});

it('does not publish an endpoint when discovery finishes after departure', async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  await emit('found', service('gone'));
  await emit('lost', service('gone'));
  finish(new Response(JSON.stringify({ group_id: group.group_id, provider_device_id: 'windows',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, topology_role: 'member' })));
  await emit('lost', service('gone'));
  expect(state.exchange).not.toHaveBeenCalled();
  expect(loadDesktopSyncGroupMemberEndpoints(group.group_id)).toHaveLength(0);
});

it('collects from a restarted runtime at the same endpoint without duplicate activation', async () => {
  await emit('found', service('old'));
  await emit('changed', service('old'));
  expect(activate).toHaveBeenCalledOnce();
  await emit('found', service('new'));
  expect(activate).toHaveBeenCalledTimes(2);
  await emit('lost', service('old'));
  expect(loadDesktopSyncGroupRoutes(group.group_id)).toHaveLength(1);
});
