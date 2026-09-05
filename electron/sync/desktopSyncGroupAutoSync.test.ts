import { beforeEach, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  continueSync: vi.fn(),
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Desktop', platform: 'darwin', state: 'active' },
      { device_identity_key: 'android-b', device_name: 'A5', platform: 'android-capacitor', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
  },
  onError: null as null | ((error: Error) => void),
  onService: null as null | ((event: Record<string, unknown>) => void),
  participating: true,
  stop: vi.fn()
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdSession: (callbacks: typeof runtime) => {
    runtime.onError = callbacks.onError;
    runtime.onService = callbacks.onService;
    return { stop: runtime.stop };
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => runtime.participating
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./desktopSyncCoordinator.js', () => ({
  runDesktopSyncCoordinator: runtime.continueSync
}));

import {
  runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync,
  stopDesktopSyncGroupAutoSync
} from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

function service(extra: Record<string, string> = {}, addresses = ['192.168.1.12']) {
  return {
    addresses, domain: 'local.', fqdn: 'a5._foliole-sync._tcp.local.',
    host: 'a5.local.', interfaceIndex: 1, name: 'A5', port: 43121,
    txt: { ...serializeSyncProtocolTxt(), device_id: 'android-b', group_id: 'group-1', ...extra },
    type: '_foliole-sync._tcp'
  };
}

function mobileService(extra: Record<string, string> = {}) {
  const next = service(extra);
  return {
    ...next,
    txt: {
      ...serializeSyncProtocolTxt(), group_id: 'group-1', provider_device_id: 'android-b', ...extra
    }
  };
}

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.onError = null;
  runtime.onService = null;
  runtime.participating = true;
  runtime.continueSync.mockResolvedValue({ complete: true, cursor: 9 });
});

it('discovers a transient route for manual sync while automatic sync is disabled', async () => {
  runtime.participating = false;
  const manual = runDesktopManualSyncWithDiscovery();
  runtime.onService?.({ kind: 'found', service: service() });

  await expect(manual).resolves.toEqual({ complete: true, cursor: 9 });
  expect(runtime.continueSync).toHaveBeenCalledWith('manual', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', peer_device_id: 'android-b'
  }));
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});

it('lets manual sync consume the active automatic discovery session', async () => {
  startDesktopSyncGroupAutoSync();
  const manual = runDesktopManualSyncWithDiscovery();
  runtime.onService?.({ kind: 'found', service: service() });

  await expect(manual).resolves.toEqual({ complete: true, cursor: 9 });
  expect(runtime.continueSync).toHaveBeenCalledWith('manual', expect.objectContaining({
    peer_device_id: 'android-b'
  }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toHaveLength(1);
});

it('cancels pending on-demand discovery with the desktop discovery lifecycle', async () => {
  runtime.participating = false;
  const manual = runDesktopManualSyncWithDiscovery();
  stopDesktopSyncGroupAutoSync();

  await expect(manual).rejects.toThrow('desktop_dnssd_session_stopped');
  expect(runtime.stop).toHaveBeenCalledOnce();
});

it('automatically syncs a saved Device at its resolved OS DNS-SD route', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: service() });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', local_device_id: 'desktop-a',
    peer_device_id: 'android-b', peer_device_name: 'A5'
  }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', peer_device_id: 'android-b'
  })]);
});

it('automatically syncs a native mobile provider using its advertised Device field', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: mobileService() });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', peer_device_id: 'android-b'
  }));
});

it('rejects an incompatible discovered Device before transport', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: service({
    protocol_max_version: '2', protocol_min_version: '2', protocol_version: '2'
  }) });
  await Promise.resolve();

  expect(runtime.continueSync).not.toHaveBeenCalled();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});

it('tries each resolved address and keeps only the successful transient route', async () => {
  runtime.continueSync.mockRejectedValueOnce(new Error('unreachable route'));
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: service({
    ipv4_addresses: '192.168.0.10,169.254.161.89'
  }, ['169.254.161.89']) });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.0.10:43121'
  }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([expect.objectContaining({
    endpoint_url: 'http://192.168.0.10:43121'
  })]);
});

it('removes a route when the system DNS-SD service is lost', async () => {
  startDesktopSyncGroupAutoSync();
  const peer = service();
  runtime.onService?.({ kind: 'found', service: peer });
  await vi.waitFor(() => expect(loadDesktopSyncGroupRoutes('group-1')).toHaveLength(1));
  runtime.onService?.({ kind: 'lost', service: peer });

  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});

it('fails closed and clears routes when the OS discovery host fails', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: service() });
  await vi.waitFor(() => expect(loadDesktopSyncGroupRoutes('group-1')).toHaveLength(1));
  runtime.onError?.(new Error('desktop_dnssd_browse_failed'));

  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});

it('retries the newest changed service after an in-flight sync settles', async () => {
  const first = deferred<{ complete: boolean; cursor: number }>();
  runtime.continueSync.mockReturnValueOnce(first.promise);
  startDesktopSyncGroupAutoSync();
  runtime.onService?.({ kind: 'found', service: service() });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  runtime.onService?.({ kind: 'changed', service: { ...service(), port: 43122 } });
  first.resolve({ complete: true, cursor: 9 });

  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43122'
  }));
});
