import { beforeEach, expect, it, vi } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../../lib/platform/syncProtocolContract';

const runtime = vi.hoisted(() => ({
  plugin: {
    desktopHttpRequest: vi.fn(),
    loadDiscoveryCandidates: vi.fn(),
    loadSyncParticipationState: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => runtime.plugin)
}));

import { discoverCompanionDesktops } from './companionWorkspaceDiscovery';

const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.plugin.loadSyncParticipationState.mockResolvedValue({
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  });
});

it('discovers a mobile provider without requiring a desktop', async () => {
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://iphone.local:45678',
      protocol_txt: {
        ...serializeSyncProtocolTxt(protocol),
        provider_platform: 'ios-capacitor', device_id: 'phone', group_id: 'group-1', group_tag: 'group-tag-1'
      },
      source: 'nsd'
    }]
  });
  runtime.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({
      app_version: '0.1.0', group_display_name: 'Foliole', group_id: 'group-1',
      group_tag: 'group-tag-1', protocol, provider_device_id: 'phone',
      provider_device_name: 'Phone', provider_platform: 'ios-capacitor', runtime_instance_id: 'runtime-phone'
    }),
    status: 200
  });

  expect(await discoverCompanionDesktops('http://accepted-mac.local:38641')).toEqual([
    expect.objectContaining({ endpointUrl: 'http://iphone.local:45678', compatibility: expect.objectContaining({ status: 'compatible' }) })
  ]);
});

it('refuses a peer whose HTTP identity disagrees with its advertisement', async () => {
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://stale-phone.local:38644',
      protocol_txt: {
        ...serializeSyncProtocolTxt(protocol),
        device_id: 'stale-phone', group_id: 'group-1', group_tag: 'group-tag-1',
        topology_role: 'member'
      },
      source: 'nsd'
    }]
  });

  runtime.plugin.desktopHttpRequest.mockResolvedValue({ status: 200, body: JSON.stringify({
    group_id: 'group-1', group_tag: 'group-tag-1', protocol, provider_device_id: 'another-phone',
    provider_platform: 'ios-capacitor'
  }) });
  expect(await discoverCompanionDesktops('http://old-desktop.local:38641')).toEqual([
    expect.objectContaining({ compatibility: expect.objectContaining({ status: 'incompatible' }) })
  ]);
});

it('does not let a stalled native probe block a reachable iOS desktop', async () => {
  vi.useFakeTimers();
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://reachable-mac.local:38641',
      protocol_txt: { ...serializeSyncProtocolTxt(protocol), device_id: 'desktop-mac',
        group_id: 'group-1', group_tag: 'group-tag-1', provider_platform: 'macOS',
        topology_role: 'anchor' },
      source: 'nsd'
    }]
  });
  runtime.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (url.startsWith('http://reachable-mac.local:38641')) {
      return {
        body: JSON.stringify({
          app_version: '0.1.0', group_display_name: 'Foliole', group_id: 'group-1',
          group_tag: 'group-tag-1', protocol, provider_device_id: 'desktop-mac',
          provider_device_name: 'Mac', provider_platform: 'macOS', runtime_instance_id: 'runtime-mac',
          topology_role: 'anchor'
        }),
        status: 200
      };
    }
    return await new Promise(() => undefined);
  });

  const resultPromise = discoverCompanionDesktops('http://stale-mac.local:38641');
  await vi.advanceTimersByTimeAsync(1_200);

  await expect(resultPromise).resolves.toEqual([
    expect.objectContaining({ endpointUrl: 'http://reachable-mac.local:38641' })
  ]);
  vi.useRealTimers();
});
