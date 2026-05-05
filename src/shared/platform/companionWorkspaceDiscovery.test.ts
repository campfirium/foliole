import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    loadDiscoveryCandidates: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

import { discoverCompanionDesktop, discoverCompanionDesktops } from './companionWorkspaceDiscovery';

describe('companionWorkspaceDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
  });

  it('discovers a native Android desktop candidate beyond the emulator default', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      endpoint_urls: ['http://192.168.1.44:38641']
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('http://192.168.1.44:38641')) {
          return new Response(
            JSON.stringify({
              app_version: '0.1.0',
              desktop_device_name: 'Foliole Desktop on ZEPHU-PC',
              desktop_name: 'Foliole Desktop',
              desktop_platform: 'Windows',
              host_name: 'ZEPHU-PC',
              pairing_mode: 'desktop-confirm',
              peer_id: 'desktop-local'
            })
          );
        }
        throw new TypeError('Failed to fetch');
      })
    );

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://192.168.1.44:38641');
    expect(result.discovery.desktop_name).toBe('Foliole Desktop');
  });

  it('uses the adb reverse loopback endpoint in emulator development', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({ endpoint_urls: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1:38641')) {
          return new Response(
            JSON.stringify({
              app_version: '0.1.0',
              desktop_device_name: 'Foliole Desktop on ZEPHU-PC',
              desktop_name: 'Foliole Desktop',
              desktop_platform: 'Windows',
              host_name: 'ZEPHU-PC',
              pairing_mode: 'desktop-confirm',
              peer_id: 'desktop-local'
            })
          );
        }
        throw new TypeError('Failed to fetch');
      })
    );

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://127.0.0.1:38641');
  });

  it('returns multiple desktops and deduplicates emulator aliases by peer id', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      endpoint_urls: ['http://192.168.1.44:38641', 'http://192.168.1.45:38641']
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1:38641') || url.startsWith('http://10.0.2.2:38641')) {
          return new Response(
            JSON.stringify({
              app_version: '0.1.0',
              desktop_device_name: 'Foliole Desktop on Dev',
              desktop_name: 'Foliole Desktop',
              desktop_platform: 'Windows',
              host_name: 'Dev',
              pairing_mode: 'desktop-confirm',
              peer_id: 'desktop-dev'
            })
          );
        }
        if (url.startsWith('http://192.168.1.44:38641')) {
          return new Response(
            JSON.stringify({
              app_version: '0.1.0',
              desktop_device_name: 'Foliole Desktop on Dev',
              desktop_name: 'Foliole Desktop',
              desktop_platform: 'Windows',
              host_name: 'Dev',
              pairing_mode: 'desktop-confirm',
              peer_id: 'desktop-dev'
            })
          );
        }
        if (url.startsWith('http://192.168.1.45:38641')) {
          return new Response(
            JSON.stringify({
              app_version: '0.1.0',
              desktop_device_name: 'Foliole Desktop on Studio',
              desktop_name: 'Foliole Desktop',
              desktop_platform: 'macOS',
              host_name: 'Studio',
              pairing_mode: 'desktop-confirm',
              peer_id: 'desktop-studio'
            })
          );
        }
        throw new TypeError('Failed to fetch');
      })
    );

    const results = await discoverCompanionDesktops('http://10.0.2.2:38641');

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.discovery.peer_id)).toEqual(['desktop-dev', 'desktop-studio']);
  });

});
