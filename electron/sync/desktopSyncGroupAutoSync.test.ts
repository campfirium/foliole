import { beforeEach, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((event: Record<string, unknown>) => void),
  continueSync: vi.fn(),
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Desktop', platform: 'darwin', state: 'active' },
      { device_identity_key: 'android-b', device_name: 'A5', platform: 'android-capacitor', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
  },
  start: vi.fn(),
  stop: vi.fn()
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdBrowse: (callback: (event: Record<string, unknown>) => void) => {
    runtime.callback = callback;
    runtime.start();
    return { stop: runtime.stop };
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: runtime.continueSync }));

import { startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.callback = null;
  runtime.continueSync.mockResolvedValue({ complete: true, cursor: 9 });
});

function service(port = 43121, extra: Record<string, string> = {}) {
  return { addresses: ['192.168.1.12'], domain: 'local.', fqdn: `peer-${port}`,
    host: 'peer.local.', interfaceIndex: 7, name: 'A5', port,
    txt: { ...serializeSyncProtocolTxt(), device_id: 'android-b', group_id: 'group-1', ...extra },
    type: '_foliole-sync._tcp' };
}

it('continues automatic sync from an OS-resolved transient peer route', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({ kind: 'found', service: service() });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.continueSync).toHaveBeenCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', local_device_id: 'desktop-a',
    peer_device_id: 'android-b', peer_device_name: 'A5'
  }));
});

it('replaces the transient route when the system resolve result changes', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({ kind: 'found', service: service() });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  runtime.callback?.({ kind: 'changed', service: service(43122, { facts_revision: '2' }) });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledTimes(2));
  expect(runtime.continueSync).toHaveBeenLastCalledWith('automatic', expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43122'
  }));
});

it('clears a route on system service loss without treating loss as a sync trigger', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({ kind: 'found', service: service() });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  runtime.callback?.({ kind: 'lost', service: service() });
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
  expect(runtime.continueSync).toHaveBeenCalledOnce();
});

it('rejects an incompatible discovered Device before opening transport', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({ kind: 'found', service: service(43121, {
    protocol_max_version: '2', protocol_min_version: '2', protocol_version: '2'
  }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.continueSync).not.toHaveBeenCalled();
});

it('fails closed and disposes the browser when the OS capability fails', () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({ code: 'desktop_dnssd_browse_failed', kind: 'error', message: '55' });
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});

it('fails closed when the OS capability cannot start', () => {
  runtime.start.mockImplementationOnce(() => { throw new Error('desktop_dnssd_unavailable'); });

  expect(() => startDesktopSyncGroupAutoSync()).not.toThrow();
  expect(runtime.stop).not.toHaveBeenCalled();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});
