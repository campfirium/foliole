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

import { discoverCompanionDesktops } from './companionWorkspaceDiscovery';

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
