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
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => runtime.plugin)
}));

import { discoverCompanionDesktops } from './companionWorkspaceDiscovery';

const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;

function anchor(endpointUrl: string) {
  return { endpoint_url: endpointUrl, source: 'nsd', protocol_txt: {
    ...serializeSyncProtocolTxt(protocol), device_id: 'desktop-mac',
    group_id: 'group-1', group_tag: 'tag-1', provider_platform: 'darwin',
    topology_role: 'anchor'
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.plugin.loadSyncParticipationState.mockResolvedValue({
    sync_enabled: true, sync_paused: false
  });
});

it('finds a reachable group anchor when the first advertisement only has a dead route', async () => {
  runtime.plugin.loadDiscoveryCandidates
    .mockResolvedValueOnce({ candidates: [anchor('http://unreachable:38643')] })
    .mockResolvedValueOnce({ candidates: [anchor('http://reachable:38643')] });
  runtime.plugin.desktopHttpRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (url.startsWith('http://unreachable:')) throw new TypeError('Connection timed out');
    return { status: 200, body: JSON.stringify({
      app_version: '0.7.14', group_display_name: 'Mac', group_id: 'group-1',
      group_tag: 'tag-1', protocol, provider_device_id: 'desktop-mac',
      provider_device_name: 'Mac', provider_platform: 'macOS',
      runtime_instance_id: 'runtime-mac', topology_role: 'anchor'
    }) };
  });

  await expect(discoverCompanionDesktops('http://old:38643', { requiredGroupId: 'group-1' }))
    .resolves.toEqual([expect.objectContaining({ endpointUrl: 'http://reachable:38643' })]);
  expect(runtime.plugin.loadDiscoveryCandidates).toHaveBeenCalledTimes(2);
});
