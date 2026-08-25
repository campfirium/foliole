import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  constructorArgs: [] as unknown[][],
  destroy: vi.fn(),
  networkInterfaces: vi.fn(),
  onServices: [] as Array<(service: Record<string, unknown>) => void>,
  stop: vi.fn()
}));

vi.mock('node:os', () => ({
  default: { hostname: () => 'Windows-C', networkInterfaces: runtime.networkInterfaces }
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    constructor(...args: unknown[]) { runtime.constructorArgs.push(args); }
    destroy() { runtime.destroy(); }
    find(_options: unknown, onService: (service: Record<string, unknown>) => void) {
      runtime.onServices.push(onService);
      return { stop: runtime.stop };
    }
  }
}));

vi.mock('./syncGroupRuntimeInstance.js', () => ({ loadSyncGroupRuntimeInstanceId: () => 'runtime-local' }));

import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';

beforeEach(() => {
  runtime.networkInterfaces.mockReturnValue({});
});

afterEach(() => {
  vi.useRealTimers();
  runtime.constructorArgs = [];
  runtime.destroy.mockReset();
  runtime.networkInterfaces.mockReset();
  runtime.onServices = [];
  runtime.stop.mockReset();
});

describe('desktop Sync Group discovery', () => {
  it('finds an Android provider on the physical LAN when another IPv4 route is present', async () => {
    vi.useFakeTimers();
    runtime.networkInterfaces.mockReturnValue({
      ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }],
      tunnel: [{ address: '198.18.0.1', family: 'IPv4', internal: false }]
    });
    const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
      group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1', peer_id: 'device-a',
      provider_device_kind: 'android-capacitor', provider_device_name: 'Android B', timeline_id: 'timeline-1'
    })));
    const discovery = discoverDesktopSyncGroups(fetchDiscovery as unknown as typeof fetch);
    runtime.onServices[1]?.({
      addresses: ['192.168.0.10'],
      name: 'Desktop A',
      port: 41186,
      txt: { group_id: 'group-1', peer_id: 'device-a', runtime_instance_id: 'runtime-local', timeline_id: 'timeline-1' }
    });
    runtime.onServices[1]?.({
      addresses: ['192.168.0.107'],
      name: 'Android B',
      port: 41187,
      txt: {
        group_display_name: 'Daily Group',
        group_id: 'group-1',
        group_tag: 'tag-1',
        peer_id: 'device-a',
        timeline_id: 'timeline-1'
      }
    });
    await vi.advanceTimersByTimeAsync(1_800);

    expect(runtime.constructorArgs).toEqual([
      [], [{ interface: '192.168.0.11' }], [{ interface: '198.18.0.1' }]
    ]);
    await expect(discovery).resolves.toEqual([{
      endpoint_url: 'http://192.168.0.107:41187',
      group_display_name: 'Daily Group',
      group_id: 'group-1',
      group_tag: 'tag-1',
      provider_authorization_id: 'device-a',
      provider_host_name: 'Android B',
      provider_host_platform: 'desktop',
      timeline_id: 'timeline-1'
    }]);
    expect(runtime.stop).toHaveBeenCalledTimes(3);
    expect(runtime.destroy).toHaveBeenCalledTimes(3);
  });
});

describe('desktop Sync Group provider selection', () => {
  it('collapses one group to its stable desktop provider on the discovered LAN path', async () => {
    vi.useFakeTimers();
    const fetchDiscovery = vi.fn(async (url: string | URL | Request) => {
      const desktop = String(url).includes('192.168.0.12');
      return new Response(JSON.stringify({
        desktop_device_name: desktop ? 'Desktop A' : undefined,
        desktop_platform: desktop ? 'macOS' : undefined,
        group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
        peer_id: desktop ? 'device-a' : 'device-b',
        provider_device_kind: desktop ? undefined : 'android-capacitor',
        provider_device_name: desktop ? undefined : 'Android B', timeline_id: 'timeline-1'
      }));
    });
    const discovery = discoverDesktopSyncGroups(fetchDiscovery as unknown as typeof fetch);
    runtime.onServices[0]?.({ addresses: ['198.18.0.1'], name: 'Desktop A', port: 38641,
      referer: { address: '192.168.0.12' }, txt: {
        group_id: 'group-1', group_tag: 'tag-1', peer_id: 'device-a', timeline_id: 'timeline-1'
      } });
    runtime.onServices[0]?.({ addresses: ['192.168.0.13'], name: 'Android B', port: 37819,
      referer: { address: '192.168.0.13' }, txt: {
        group_id: 'group-1', group_tag: 'tag-1', peer_id: 'device-b', timeline_id: 'timeline-1'
      } });
    await vi.advanceTimersByTimeAsync(1_800);

    await expect(discovery).resolves.toEqual([expect.objectContaining({
      endpoint_url: 'http://192.168.0.12:38641',
      provider_authorization_id: 'device-a', provider_host_platform: 'darwin'
    })]);
  });
});
