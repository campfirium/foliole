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

it('does not probe a mobile provider while finding desktop sync targets', async () => {
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://iphone.local:45678',
      protocol_txt: {
        ...serializeSyncProtocolTxt(protocol),
        provider_platform: 'ios-capacitor'
      },
      source: 'nsd'
    }]
  });
  runtime.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({
      app_version: '0.1.0', group_display_name: 'Foliole', group_id: 'group-1',
      group_tag: 'group-tag-1', protocol, provider_device_id: 'desktop-mac',
      provider_device_name: 'Mac', provider_platform: 'macOS', runtime_instance_id: 'runtime-mac'
    }),
    status: 200
  });

  await discoverCompanionDesktops('http://accepted-mac.local:38641');

  expect(runtime.plugin.desktopHttpRequest).toHaveBeenCalledOnce();
  expect(runtime.plugin.desktopHttpRequest).not.toHaveBeenCalledWith(
    expect.objectContaining({ url: expect.stringContaining('iphone.local') })
  );
});

it('does not let a stalled native probe block a reachable iOS desktop', async () => {
  vi.useFakeTimers();
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({
    candidates: [{
      endpoint_url: 'http://reachable-mac.local:38641',
      protocol_txt: serializeSyncProtocolTxt(protocol),
      source: 'nsd'
    }]
  });
  runtime.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (url.startsWith('http://reachable-mac.local:38641')) {
      return {
        body: JSON.stringify({
          app_version: '0.1.0', group_display_name: 'Foliole', group_id: 'group-1',
          group_tag: 'group-tag-1', protocol, provider_device_id: 'desktop-mac',
          provider_device_name: 'Mac', provider_platform: 'macOS', runtime_instance_id: 'runtime-mac'
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
