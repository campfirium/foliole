import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

const syncMocks = vi.hoisted(() => ({
  discoverCompanionDesktop: vi.fn(),
  discoverCompanionDesktops: vi.fn(),
  loadCompanionPairingState: vi.fn(),
  pairCompanionWithDesktop: vi.fn(),
  requestCompanionPairing: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => syncMocks);

import { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};

const bootstrapState: NativeCompanionBootstrapState = {
  booted_at: '2026-07-21T08:00:00.000Z',
  database_path: 'foliole-companionSQLite.db',
  database_ready: true,
  device_id: 'ios-test-device',
  device_name: null,
  host_name: 'iPhone',
  runtime_kind: 'ios-capacitor'
};

beforeEach(() => {
  vi.clearAllMocks();
  syncMocks.loadCompanionPairingState.mockResolvedValue({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null,
  });
  syncMocks.discoverCompanionDesktop.mockResolvedValue({
    compatibility: {
      missing_capabilities: [],
      negotiated_version: 1,
      reason: null,
      status: 'compatible'
    },
    discovery: {
      app_version: '0.6.5',
      desktop_host_name: 'Roamer Mac',
      desktop_name: 'Foliole Desktop',
      desktop_platform: 'macOS',
      group_display_name: 'Maci',
      group_id: 'group-1',
      peer_id: 'desktop-mac',
      protocol,
      runtime_instance_id: 'runtime-mac',
      timeline_id: 'timeline-1'
    },
    endpointUrl: 'http://192.168.1.8:38641'
  });
  syncMocks.requestCompanionPairing.mockResolvedValue({
    expires_at: '2026-07-21T08:02:00.000Z',
    pair_request_id: 'pair-request-ios',
    status: 'pending'
  });
  syncMocks.pairCompanionWithDesktop.mockResolvedValue({
    host_name: 'iPhone',
    host_platform: 'ios-capacitor',
    is_paired: true,
    negotiated_protocol_version: 1,
    paired_at: '2026-07-21T08:03:00.000Z',
    remote_protocol: protocol,
    sync_usable: true
  });
});

it('keeps the iOS identity through Mac pairing request and completion', async () => {
  const onError = vi.fn();
  const onSaveEndpoint = vi.fn(async () => undefined);
  const { result } = renderHook(() => useCompanionWorkspacePairing({
    bootstrapState,
    onError,
    onSaveEndpoint
  }));

  await act(async () => {
    await result.current.requestPairing(' http://192.168.1.8:38641 ');
  });

  expect(syncMocks.requestCompanionPairing).toHaveBeenCalledWith({
    endpointUrl: 'http://192.168.1.8:38641',
    groupId: 'group-1',
    groupTag: undefined,
    hostName: 'iPhone',
    hostPlatform: 'ios-capacitor',
    timelineId: 'timeline-1'
  });

  await act(async () => {
    await result.current.completePairing();
  });

  expect(syncMocks.pairCompanionWithDesktop).toHaveBeenCalledWith({
    endpointUrl: 'http://192.168.1.8:38641',
    groupId: 'group-1',
    groupTag: undefined,
    hostName: 'iPhone',
    hostPlatform: 'ios-capacitor',
    pairRequestId: 'pair-request-ios',
    remotePeerId: 'desktop-mac',
    remotePeerName: 'Roamer Mac',
    remotePeerPlatform: 'macOS',
    timelineId: 'timeline-1'
  });
  expect(result.current.pairingState).toEqual(expect.objectContaining({
    host_name: 'iPhone',
    host_platform: 'ios-capacitor',
    is_paired: true
  }));
  expect(onSaveEndpoint).toHaveBeenCalledTimes(2);
});
