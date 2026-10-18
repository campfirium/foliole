import { afterEach, expect, it, vi } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../../lib/platform/syncProtocolContract';

const plugin = vi.hoisted(() => ({
  desktopHttpRequest: vi.fn(),
  loadDiscoveryCandidates: vi.fn(),
  loadSyncParticipationState: vi.fn(async () => ({
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  }))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => plugin)
}));

import { discoverCompanionDesktops, loadCompanionDiscoveryCandidates } from './companionWorkspaceDiscovery';

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('allows a hosted-speed native discovery response to finish', async () => {
  vi.useFakeTimers();
  const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;
  plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://192.168.1.44:38641',
      protocol_txt: {
        ...serializeSyncProtocolTxt(protocol), device_id: 'desktop-local',
        group_id: 'group-1', group_tag: 'group-tag-1', provider_platform: 'macOS', topology_role: 'anchor'
      },
      source: 'nsd'
    }]
  });
  plugin.desktopHttpRequest.mockImplementation(() => new Promise((resolve) => {
    setTimeout(() => resolve({
      body: JSON.stringify({
        app_version: '0.1.0', group_display_name: 'Foliole', group_id: 'group-1',
        group_tag: 'group-tag-1', protocol, provider_device_id: 'desktop-local',
        provider_device_name: 'Foliole Desktop', provider_platform: 'macOS',
        runtime_instance_id: 'runtime-desktop-local', topology_role: 'anchor'
      }),
      status: 200
    }), 3500);
  }));

  const pending = discoverCompanionDesktops('http://10.0.2.2:38641');
  await vi.advanceTimersByTimeAsync(3500);
  await expect(pending).resolves.toHaveLength(1);
});

const candidate = { endpointUrl: 'http://192.168.1.44:38641', protocolTxt: null, source: 'direct' as const };

it.each([
  ['http', () => Promise.resolve({ status: 503, body: '{}' }), { kind: 'http', status: 503 }],
  ['request', () => Promise.reject(new Error('Local network denied')), { kind: 'request', message: 'Local network denied' }],
  ['parse', () => Promise.resolve({ status: 200, body: 'invalid' }), { kind: 'parse' }]
])('retains %s failure evidence without returning a verified candidate', async (_name, request, expected) => {
  plugin.desktopHttpRequest.mockImplementation(request);
  const onFailure = vi.fn();
  await expect(loadCompanionDiscoveryCandidates([candidate], onFailure)).resolves.toEqual([]);
  expect(onFailure).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    endpointUrl: candidate.endpointUrl, ...expected
  }));
});

it('reports the unchanged five-second discovery deadline', async () => {
  vi.useFakeTimers();
  plugin.desktopHttpRequest.mockImplementation(() => new Promise(() => {}));
  const onFailure = vi.fn();
  const pending = loadCompanionDiscoveryCandidates([candidate], onFailure);
  await vi.advanceTimersByTimeAsync(5000);
  await expect(pending).resolves.toEqual([]);
  expect(onFailure).toHaveBeenCalledExactlyOnceWith({
    endpointUrl: candidate.endpointUrl, kind: 'request', message: 'Discovery request timed out.'
  });
});
