import { beforeEach, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((service: unknown) => void),
  constructorOptions: [] as unknown[],
  credentialAccess: vi.fn(() => { throw new Error('credential store should stay closed'); }),
  updateCallbacks: new Map<string, (service: unknown) => void>(),
  completeJoin: vi.fn(),
  continueSync: vi.fn(),
  destroy: vi.fn(),
  group: {
    group_id: 'group-1', local_host_name: 'Desktop', timeline_id: 'timeline-1',
    members: [
      { authorization_id: 'desktop-a', host_name: 'Desktop', host_platform: 'darwin' },
      { authorization_id: 'android-b', host_name: 'A5', host_platform: 'android-capacitor' }
    ]
  },
  stop: vi.fn(),
  update: vi.fn(),
  refreshPending: vi.fn(() => false)
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function currentTxt(extra: Record<string, string> = {}) {
  return { ...serializeSyncProtocolTxt(), ...extra };
}

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    destroy = runtime.destroy;
    constructor(options: unknown) { runtime.constructorOptions.push(options); }
    find(_query: unknown, callback: (service: unknown) => void) {
      runtime.callback = callback;
      return {
        on: (event: string, handler: (service: unknown) => void) => {
          runtime.updateCallbacks.set(event, handler);
        },
        stop: runtime.stop,
        update: runtime.update
      };
    }
  }
}));
vi.mock('./companionMdnsNetworkInterfaces.js', () => ({
  resolveCompanionMdnsDiscoveryInterfaces: () => [undefined, '192.168.1.10', '10.0.0.10'],
  resolveCompanionMdnsInterfaceOptions: (networkInterface?: string) => networkInterface
    ? { bind: '0.0.0.0', interface: networkInterface }
    : undefined
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedSyncGroupPeers: runtime.credentialAccess,
  savePairedSyncGroupPeer: runtime.credentialAccess
}));
vi.mock('./desktopSyncGroupJoin.js', () => ({
  completeDesktopSyncGroupJoin: runtime.completeJoin,
  continueDesktopSyncGroupSync: runtime.continueSync
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  refreshDesktopSyncGroupPendingJoinEndpoint: runtime.refreshPending
}));

import { startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.callback = null;
  runtime.constructorOptions = [];
  runtime.updateCallbacks.clear();
  runtime.completeJoin.mockResolvedValue({ group_id: 'group-1' });
  runtime.continueSync.mockResolvedValue({ complete: true, cursor: 9 });
  runtime.refreshPending.mockReturnValue(false);
});

it('continues the saved member sync when its provider advertises again', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.constructorOptions).toEqual([
    undefined,
    { bind: '0.0.0.0', interface: '192.168.1.10' },
    { bind: '0.0.0.0', interface: '10.0.0.10' }
  ]);
  expect(runtime.continueSync).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', local_authorization_id: 'desktop-a',
    peer_authorization_id: 'android-b', peer_host_name: 'A5'
  }));
  expect(runtime.credentialAccess).not.toHaveBeenCalled();
});

it('does not start a session for an advertised v2 member', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({
      group_id: 'group-1', peer_id: 'android-b', protocol_max_version: '2',
      protocol_min_version: '2', protocol_version: '2'
    })
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.continueSync).not.toHaveBeenCalled();
  expect(runtime.completeJoin).not.toHaveBeenCalled();
});

it('continues an approved join at the same provider new endpoint', async () => {
  runtime.refreshPending.mockReturnValue(true);
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43122,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b', timeline_id: 'timeline-1' })
  });
  await vi.waitFor(() => expect(runtime.completeJoin).toHaveBeenCalledOnce());
  expect(runtime.refreshPending).toHaveBeenCalledWith({
    endpointUrl: 'http://192.168.1.12:43122', groupId: 'group-1',
    providerAuthorizationId: 'android-b', timelineId: 'timeline-1'
  });
  expect(runtime.continueSync).not.toHaveBeenCalled();
});

it('retries the latest advertisement after an interrupted peer sync settles', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise).mockResolvedValue({ complete: true, cursor: 10 });
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43122,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b' })
  });

  first.resolve({ complete: false, cursor: 9 });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43122'
  }));
});

it('continues sync when an existing service publishes a newer facts revision', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.updateCallbacks.get('txt-update')?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ facts_revision: '2', group_id: 'group-1', peer_id: 'android-b' })
  });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
});

it('requeries the replacement instance after withdrawal-triggered sync settles', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise);
  startDesktopSyncGroupAutoSync();
  runtime.updateCallbacks.get('down')?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b' })
  });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.update).not.toHaveBeenCalled();
  first.resolve({ complete: true, cursor: 9 });
  await vi.waitFor(() => expect(runtime.update).toHaveBeenCalledOnce());
});

it('does not requery a replacement after automatic sync stops', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise);
  startDesktopSyncGroupAutoSync();
  runtime.updateCallbacks.get('down')?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ group_id: 'group-1', peer_id: 'android-b' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());

  stopDesktopSyncGroupAutoSync();
  first.resolve({ complete: true, cursor: 9 });
  await first.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.update).not.toHaveBeenCalled();
});
