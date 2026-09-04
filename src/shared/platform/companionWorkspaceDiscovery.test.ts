import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../../lib/platform/syncProtocolContract';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    desktopHttpRequest: vi.fn(),
    loadDiscoveryCandidates: vi.fn(),
    loadSyncParticipationState: vi.fn()
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

const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;
const protocolTxt = serializeSyncProtocolTxt(protocol);

function nsdCandidate(endpoint_url: string) {
  return { endpoint_url, protocol_txt: protocolTxt, source: 'nsd' };
}

function discoveryBody(args: { hostName: string; peerId: string; platform: string }) {
  return JSON.stringify({
    app_version: '0.1.0',
    group_display_name: 'Foliole',
    group_id: 'group-1',
    group_tag: 'group-tag-1',
    provider_device_id: args.peerId,
    provider_device_name: `Foliole Desktop on ${args.hostName}`,
    provider_platform: args.platform,
    runtime_instance_id: `runtime-${args.peerId}`,
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
  capacitorMock.plugin.loadSyncParticipationState.mockResolvedValue({
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  });
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

  it('probes the accepted endpoint without Android emulator fallbacks when iOS Bonjour is empty', async () => {
    capacitorMock.getPlatform.mockReturnValue('ios');
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({ candidates: [] });
    capacitorMock.plugin.desktopHttpRequest.mockResolvedValue(
      desktopResponse({ hostName: 'Mac', peerId: 'desktop-ios', platform: 'macOS' })
    );

    const result = await discoverCompanionDesktop('http://accepted-mac.local:38641');

    expect(result.endpointUrl).toBe('http://accepted-mac.local:38641');
    expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledTimes(1);
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
    expect(result.discovery.provider_device_name).toBe('Foliole Desktop on ZEPHU-PC');
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

it('keeps ordinary discovery stopped while allowing explicit Leave routing when paused', async () => {
  capacitorMock.plugin.loadSyncParticipationState.mockResolvedValue({
    lifecycle_active: true, participating: false, sync_enabled: true, sync_paused: true
  });
  capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [nsdCandidate('http://192.168.1.44:38641')]
  });
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue(
    desktopResponse({ hostName: 'ZEPHU-PC', peerId: 'desktop-c', platform: 'Windows' })
  );

  await expect(discoverCompanionDesktops('http://old:38641')).resolves.toEqual([]);
  expect(capacitorMock.plugin.loadDiscoveryCandidates).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.desktopHttpRequest).not.toHaveBeenCalled();

  const result = await discoverCompanionDesktop('http://old:38641', {
    allowWhileNotParticipating: true
  });
  expect(result.discovery.provider_device_id).toBe('desktop-c');
  expect(capacitorMock.plugin.loadDiscoveryCandidates).toHaveBeenCalledOnce();
});

it('does not let a transient native inactive snapshot veto a foreground discovery caller', async () => {
  capacitorMock.plugin.loadSyncParticipationState.mockResolvedValue({
    lifecycle_active: false, participating: false, sync_enabled: true, sync_paused: false
  });
  capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [nsdCandidate('http://192.168.1.44:38641')]
  });
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue(
    desktopResponse({ hostName: 'Mac', peerId: 'desktop-mac', platform: 'macOS' })
  );

  const result = await discoverCompanionDesktop('http://old:38641');

  expect(result.discovery.provider_device_id).toBe('desktop-mac');
  expect(capacitorMock.plugin.loadDiscoveryCandidates).toHaveBeenCalledOnce();
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
    expect(results.map((result) => result.discovery.provider_device_id)).toEqual(['desktop-dev', 'desktop-studio']);
  });

  it('keeps an incompatible desktop with an explainable compatibility result', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [nsdCandidate('http://192.168.1.44:38641')]
    });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (!url.startsWith('http://192.168.1.44:38641')) throw new TypeError('Failed to fetch');
      const body = JSON.parse(discoveryBody({ hostName: 'Old', peerId: 'desktop-old', platform: 'Windows' }));
      const unsupportedVersion = protocol.version + 1;
      body.protocol = { ...protocol, version: unsupportedVersion, min_supported_version: unsupportedVersion, max_supported_version: unsupportedVersion };
      return { body: JSON.stringify(body), status: 200 };
    });

    const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

    expect(result.compatibility).toMatchObject({
      reason: 'protocol_version_unsupported',
      status: 'incompatible'
    });
  });

  it('keeps separate providers that advertise the same Sync Group timeline', async () => {
    capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
      candidates: [
        nsdCandidate('http://192.168.1.44:38641'),
        nsdCandidate('http://192.168.1.45:38641')
      ]
    });
    capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
      const peerId = url.startsWith('http://192.168.1.44:38641') ? 'desktop-a' : 'desktop-c';
      if (!url.startsWith('http://192.168.1.4')) throw new TypeError('Failed to fetch');
      const body = JSON.parse(discoveryBody({ hostName: peerId, peerId, platform: 'macOS' }));
      Object.assign(body, { group_id: 'group-1' });
      return { body: JSON.stringify(body), status: 200 };
    });

    const results = await discoverCompanionDesktops('http://10.0.2.2:38641');

    expect(results.map((result) => result.discovery.provider_device_id)).toEqual(['desktop-a', 'desktop-c']);
  });
});

it('requires full capabilities from public discovery rather than the TXT hint', async () => {
  capacitorMock.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [nsdCandidate('http://192.168.1.44:38641')]
  });
  capacitorMock.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (!url.startsWith('http://192.168.1.44:38641')) throw new TypeError('Failed to fetch');
    const body = JSON.parse(discoveryBody({ hostName: 'Old', peerId: 'desktop-old', platform: 'Windows' }));
    body.protocol = { ...protocol, capabilities: protocol.capabilities.slice(1) };
    return { body: JSON.stringify(body), status: 200 };
  });

  const result = await discoverCompanionDesktop('http://10.0.2.2:38641');

  expect(result.compatibility).toMatchObject({
    reason: 'required_capability_missing', status: 'incompatible'
  });
});
