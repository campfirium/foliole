import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    desktopHttpRequest: vi.fn(),
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

function discoveryBody(args: { hostName: string; peerId: string; platform: string }) {
  return JSON.stringify({
    app_version: '0.1.0',
    desktop_device_name: `Foliole Desktop on ${args.hostName}`,
    desktop_name: 'Foliole Desktop',
    desktop_platform: args.platform,
    pairing_mode: 'desktop-confirm',
    peer_id: args.peerId
  });
}

function desktopResponse(args: { hostName: string; peerId: string; platform: string }) {
  return { body: discoveryBody(args), status: 200 };
}

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
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.startsWith('http://192.168.1.44:38641')) {
        return desktopResponse({ hostName: 'ZEPHU-PC', peerId: 'desktop-local', platform: 'Windows' });
      }
      throw new TypeError('Failed to fetch');
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://192.168.1.44:38641');
    expect(result.discovery.desktop_name).toBe('Foliole Desktop');
  });

  it('uses the adb reverse loopback endpoint in emulator development', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({ endpoint_urls: [] });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.startsWith('http://127.0.0.1:38641')) {
        return desktopResponse({ hostName: 'ZEPHU-PC', peerId: 'desktop-local', platform: 'Windows' });
      }
      throw new TypeError('Failed to fetch');
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://127.0.0.1:38641');
  });

  it('returns multiple desktops and deduplicates emulator aliases by peer id', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      endpoint_urls: ['http://192.168.1.44:38641', 'http://192.168.1.45:38641']
    });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (
        url.startsWith('http://127.0.0.1:38641') ||
        url.startsWith('http://10.0.2.2:38641') ||
        url.startsWith('http://192.168.1.44:38641')
      ) {
        return desktopResponse({ hostName: 'Dev', peerId: 'desktop-dev', platform: 'Windows' });
      }
      if (url.startsWith('http://192.168.1.45:38641')) {
        return desktopResponse({ hostName: 'Studio', peerId: 'desktop-studio', platform: 'macOS' });
      }
      throw new TypeError('Failed to fetch');
    });

    const results = await discoverCompanionDesktops('http://10.0.2.2:38641');

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.discovery.peer_id)).toEqual(['desktop-dev', 'desktop-studio']);
  });

});
