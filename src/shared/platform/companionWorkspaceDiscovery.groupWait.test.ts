import { expect, it, vi } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../../lib/platform/syncProtocolContract';

const runtime = vi.hoisted(() => ({
  plugin: {
    addListener: vi.fn(),
    desktopHttpRequest: vi.fn(),
    loadDiscoveryCandidates: vi.fn(),
    startDiscoverySession: vi.fn(),
    stopDiscoverySession: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => runtime.plugin)
}));

import { discoverCompanionDesktops } from './companionWorkspaceDiscovery';

function anchor(groupId: string, endpointUrl: string) {
  return { endpoint_url: endpointUrl, source: 'nsd', protocol_txt: {
    ...serializeSyncProtocolTxt(CURRENT_SYNC_PROTOCOL_DESCRIPTOR),
    device_id: `desktop-${groupId}`, group_id: groupId, group_tag: `tag-${groupId}`,
    provider_platform: 'darwin', topology_role: 'anchor'
  } };
}

it('waits for this group when an older group anchor resolves first', async () => {
  vi.clearAllMocks();
  let publish!: (event: Record<string, unknown>) => void;
  const old = anchor('old-group', 'http://192.168.1.43:38641');
  const target = anchor('group-1', 'http://192.168.1.44:38643');
  runtime.plugin.loadDiscoveryCandidates.mockResolvedValue({ candidates: [old] });
  runtime.plugin.addListener.mockImplementation(async (_name, listener) => {
    publish = listener;
    return { remove: vi.fn(async () => undefined) };
  });
  runtime.plugin.startDiscoverySession.mockResolvedValue({ candidates: [old], status: 'results' });
  runtime.plugin.stopDiscoverySession.mockResolvedValue({ candidates: [], status: 'stopped' });
  runtime.plugin.desktopHttpRequest.mockResolvedValue({ status: 200, body: JSON.stringify({
    app_version: '0.7.14', group_display_name: 'Mac', group_id: 'group-1',
    group_tag: 'tag-group-1', protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    provider_device_id: 'desktop-group-1', provider_device_name: 'Mac',
    provider_platform: 'macOS', runtime_instance_id: 'runtime-target', topology_role: 'anchor'
  }) });

  const pending = discoverCompanionDesktops('http://old:38641', {
    requiredGroupId: 'group-1', allowWhileNotParticipating: true
  });
  await vi.waitFor(() => expect(runtime.plugin.startDiscoverySession).toHaveBeenCalledOnce());
  expect(runtime.plugin.desktopHttpRequest).not.toHaveBeenCalled();
  publish({ candidates: [old, target], status: 'results' });

  await expect(pending).resolves.toEqual([
    expect.objectContaining({ endpointUrl: target.endpoint_url,
      compatibility: expect.objectContaining({ status: 'compatible' }) })
  ]);
  expect(runtime.plugin.stopDiscoverySession).toHaveBeenCalledOnce();
});
