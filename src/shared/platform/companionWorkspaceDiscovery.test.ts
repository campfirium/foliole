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

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};
const protocolTxt = {
  protocol_capabilities: 'lan-sync-v1',
  protocol_max_version: '1',
  protocol_min_version: '1',
  protocol_version: '1'
};

function nsdCandidate(endpoint_url: string) {
  return { endpoint_url, protocol_txt: protocolTxt, source: 'nsd' };
}

function discoveryBody(args: { hostName: string; peerId: string; platform: string }) {
  return JSON.stringify({
    app_version: '0.1.0',
    desktop_device_name: `Foliole Desktop on ${args.hostName}`,
    desktop_name: 'Foliole Desktop',
    desktop_platform: args.platform,
    pairing_mode: 'desktop-confirm',
    peer_id: args.peerId,
    protocol
  });
}

function desktopResponse(args: { hostName: string; peerId: string; platform: string }) {
  return { body: discoveryBody(args), status: 200 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
});

describe('companionWorkspaceDiscovery endpoint selection', () => {
  it('uses iOS native Bonjour candidates and native HTTP', async () => {
    capacitorMock.getPlatform.mockReturnValue('ios');
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [nsdCandidate('http://foliole-desktop.local:38641')]
    });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.startsWith('http://foliole-desktop.local:38641')) {
        return desktopResponse({ hostName: 'Mac', peerId: 'desktop-ios', platform: 'macOS' });
      }
      throw new TypeError('Failed to fetch');
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://foliole-desktop.local:38641');
    expect(capacitorMock.plugin.loadDiscoveryCandidates).toHaveBeenCalledOnce();
  });

  it('does not probe Android emulator fallbacks when iOS Bonjour finds no desktop', async () => {
    capacitorMock.getPlatform.mockReturnValue('ios');
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({ candidates: [] });

    await expect(discoverCompanionDesktops('http://10.0.2.2:38641')).rejects.toThrow(
      'No desktop sync device found'
    );

    expect(capacitorMock.plugin.desktopHttpRequest).not.toHaveBeenCalled();
  });

  it('discovers a native Android desktop candidate beyond the emulator default', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [nsdCandidate('http://192.168.1.44:38641')]
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
    expect(result.compatibility.status).toBe('compatible');
  });

  it('uses the adb reverse loopback endpoint in emulator development', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({ candidates: [] });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.startsWith('http://127.0.0.1:38641')) {
        return desktopResponse({ hostName: 'ZEPHU-PC', peerId: 'desktop-local', platform: 'Windows' });
      }
      throw new TypeError('Failed to fetch');
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.endpointUrl).toBe('http://127.0.0.1:38641');
  });
});

describe('companionWorkspaceDiscovery compatibility', () => {
  it('returns multiple desktops and deduplicates emulator aliases by peer id', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [
        nsdCandidate('http://192.168.1.44:38641'),
        nsdCandidate('http://192.168.1.45:38641')
      ]
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

  it('keeps an incompatible desktop with an explainable compatibility result', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [nsdCandidate('http://192.168.1.44:38641')]
    });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (!url.startsWith('http://192.168.1.44:38641')) throw new TypeError('Failed to fetch');
      const body = JSON.parse(discoveryBody({ hostName: 'Old', peerId: 'desktop-old', platform: 'Windows' }));
      body.protocol = { ...protocol, version: 2, min_supported_version: 2, max_supported_version: 2 };
      return { body: JSON.stringify(body), status: 200 };
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.compatibility).toMatchObject({
      reason: 'protocol_version_unsupported',
      status: 'incompatible'
    });
  });
});
