import { beforeEach, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((service: unknown) => void),
  constructorOptions: [] as unknown[],
  credentialAccess: vi.fn(() => { throw new Error('credential store should stay closed'); }),
  updateCallbacks: new Map<string, (service: unknown) => void>(),
  continueSync: vi.fn(),
  destroy: vi.fn(),
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Desktop', platform: 'darwin', state: 'active' },
      { device_identity_key: 'android-b', device_name: 'A5', platform: 'android-capacitor', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
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
vi.mock('./companionMdnsAdvertisement.js', () => ({
  resolveCompanionMdnsIpv4Addresses: () => ['192.168.1.10', '10.0.0.10']
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./desktopSyncCoordinator.js', () => ({
  runDesktopSyncCoordinator: runtime.continueSync
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
  runtime.continueSync.mockResolvedValue({ complete: true, cursor: 9 });
  runtime.refreshPending.mockReturnValue(false);
});

it('continues sync with a saved Device when its provider advertises again', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.constructorOptions).toEqual([
    undefined, { interface: '192.168.1.10' }, { interface: '10.0.0.10' }
  ]);
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', local_device_id: 'desktop-a',
    peer_device_id: 'android-b', peer_device_name: 'A5'
  }));
  expect(runtime.credentialAccess).not.toHaveBeenCalled();
});

it('does not start a session for an advertised v2 Device', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({
      device_id: 'android-b', group_id: 'group-1', protocol_max_version: '2',
      protocol_min_version: '2', protocol_version: '2'
    })
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.continueSync).not.toHaveBeenCalled();
});

it('continues a saved Device at its newly advertised endpoint', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43122,
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43122', peer_device_id: 'android-b'
  }));
});

it('uses the reachable announcement source before a peer virtual adapter address', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.56.1', '192.168.0.11'], port: 43122,
    referer: { address: '192.168.0.11' },
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.0.11:43122'
  }));
});

it('falls back to an advertised LAN address when the announcement source cannot sync', async () => {
  runtime.continueSync.mockRejectedValueOnce(new Error('unreachable route'));
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['169.254.161.89'], port: 43122,
    referer: { address: '169.254.161.89' },
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1',
      ipv4_addresses: '192.168.0.10,169.254.161.89' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.0.10:43122'
  }));
});

it('retries the latest advertisement after an interrupted peer sync settles', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise).mockResolvedValue({ complete: true, cursor: 10 });
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43122,
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });

  first.resolve({ complete: false, cursor: 9 });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43122'
  }));
});

it('continues sync when an existing service publishes a newer facts revision', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.updateCallbacks.get('txt-update')?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ device_id: 'android-b', facts_revision: '2', group_id: 'group-1' })
  });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
});

it('requeries the replacement instance after withdrawal-triggered sync settles', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise);
  startDesktopSyncGroupAutoSync();
  runtime.updateCallbacks.get('down')?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
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
    txt: currentTxt({ device_id: 'android-b', group_id: 'group-1' })
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());

  stopDesktopSyncGroupAutoSync();
  first.resolve({ complete: true, cursor: 9 });
  await first.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.update).not.toHaveBeenCalled();
});
