import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((event: Record<string, unknown>) => void),
  stop: vi.fn()
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdBrowse: (callback: (event: Record<string, unknown>) => void) => {
    runtime.callback = callback;
    return { stop: runtime.stop };
  }
}));

vi.mock('./syncGroupRuntimeInstance.js', () => ({ loadSyncGroupRuntimeInstanceId: () => 'runtime-local' }));

import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';

beforeEach(() => {
  runtime.callback = null;
});

afterEach(() => {
  vi.useRealTimers();
  runtime.stop.mockReset();
});

function emitService(service: Record<string, unknown>) {
  runtime.callback?.({ kind: 'found', service: { domain: 'local.', fqdn: 'remote',
    host: 'remote.local.', interfaceIndex: 7, type: '_foliole-sync._tcp', ...service } });
}

describe('desktop Sync Group discovery', () => {
  it('finds an Android provider on the physical LAN when another IPv4 route is present', async () => {
    vi.useFakeTimers();
    const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
      group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
      provider_device_id: 'device-a', provider_device_name: 'Android B',
      provider_platform: 'android-capacitor', runtime_instance_id: 'runtime-android-b'
    })));
    const discovery = discoverDesktopSyncGroups(fetchDiscovery as unknown as typeof fetch);
    emitService({
      addresses: ['192.168.0.10'],
      name: 'Desktop A',
      port: 41186,
      txt: { device_id: 'device-a', group_id: 'group-1', runtime_instance_id: 'runtime-local' }
    });
    emitService({
      addresses: ['192.168.0.107'],
      name: 'Android B',
      port: 41187,
      txt: {
        group_display_name: 'Daily Group',
        group_id: 'group-1',
        group_tag: 'tag-1',
        device_id: 'device-a'
      }
    });
    await vi.advanceTimersByTimeAsync(1_800);

    await expect(discovery).resolves.toEqual([{
      endpoint_url: 'http://192.168.0.107:41187',
      group_display_name: 'Daily Group',
      group_id: 'group-1',
      group_tag: 'tag-1',
      provider_device_id: 'device-a',
      provider_device_name: 'Android B',
      provider_platform: 'android-capacitor'
    }]);
    expect(runtime.stop).toHaveBeenCalledOnce();
  });
});

describe('desktop Sync Group route fallback', () => {
  it('finds a provider through an advertised LAN address after a link-local route fails', async () => {
    vi.useFakeTimers();
    const fetchDiscovery = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('169.254.161.89')) throw new Error('unreachable route');
      return new Response(JSON.stringify({
        group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
        provider_device_id: 'device-a', provider_device_name: 'Desktop A',
        provider_platform: 'darwin', runtime_instance_id: 'runtime-desktop-a'
      }));
    });
    const discovery = discoverDesktopSyncGroups(fetchDiscovery as unknown as typeof fetch);
    emitService({ addresses: ['169.254.161.89'], name: 'Desktop A', port: 38641,
      txt: { device_id: 'device-a', group_id: 'group-1',
        group_tag: 'tag-1', ipv4_addresses: '192.168.0.10,169.254.161.89' } });
    await vi.advanceTimersByTimeAsync(1_800);

    await expect(discovery).resolves.toEqual([expect.objectContaining({
      endpoint_url: 'http://192.168.0.10:38641', provider_device_id: 'device-a'
    })]);
  });
});

describe('desktop Sync Group provider selection', () => {
  it('collapses one group to its stable desktop provider on the discovered LAN path', async () => {
    vi.useFakeTimers();
    const fetchDiscovery = vi.fn(async (url: string | URL | Request) => {
      const desktop = String(url).includes('192.168.0.12');
      return new Response(JSON.stringify({
        group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
        provider_device_id: desktop ? 'device-a' : 'device-b',
        provider_device_name: desktop ? 'Desktop A' : 'Android B',
        provider_platform: desktop ? 'darwin' : 'android-capacitor',
        runtime_instance_id: desktop ? 'runtime-desktop-a' : 'runtime-android-b'
      }));
    });
    const discovery = discoverDesktopSyncGroups(fetchDiscovery as unknown as typeof fetch);
    emitService({ addresses: ['192.168.0.12', '198.18.0.1'], name: 'Desktop A', port: 38641, txt: {
        device_id: 'device-a', group_id: 'group-1', group_tag: 'tag-1'
      } });
    emitService({ addresses: ['192.168.0.13'], name: 'Android B', port: 37819, txt: {
        device_id: 'device-b', group_id: 'group-1', group_tag: 'tag-1'
      } });
    await vi.advanceTimersByTimeAsync(1_800);

    await expect(discovery).resolves.toEqual([expect.objectContaining({
      endpoint_url: 'http://192.168.0.12:38641',
      provider_device_id: 'device-a', provider_platform: 'darwin'
    })]);
  });
});
