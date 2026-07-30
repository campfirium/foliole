// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { diagnoseAndroidSyncTopology } from './android-sync-topology.mjs';

const pairingState = {
  device_id: 'a5-device',
  device_name: 'A5',
  primary_device_id: 'windows-peer',
  remote_peer_id: 'windows-peer',
  remote_peer_name: 'Foliole Desktop on Windows',
  remote_peer_platform: 'Windows'
};

describe('Android sync topology', () => {
  it('requires reverse only when a loopback endpoint points at the Windows sync peer', () => {
    expect(diagnoseAndroidSyncTopology({
      executorDeviceId: 'a5-device',
      pairingState,
      syncState: { endpoint_url: 'http://127.0.0.1:38641', sync_events: [] },
      windowsClient: { peer_id: 'windows-peer' }
    })).toMatchObject({
      endpoint_kind: 'loopback',
      executor_equals_sync_peer: false,
      reverse_policy: 'required',
      windows_equals_sync_peer: true
    });
  });

  it('forbids reverse for an explicit LAN endpoint even when Windows is the sync peer', () => {
    expect(diagnoseAndroidSyncTopology({
      executorDeviceId: 'a5-device',
      pairingState,
      syncState: {
        endpoint_url: 'http://192.168.1.9:38641',
        sync_events: [{ id: 'event-1', message: 'secret detail', occurred_at: '2026-07-26T04:00:00.000Z', status: 'failed' }]
      },
      windowsClient: { peer_id: 'windows-peer' }
    })).toMatchObject({
      endpoint_kind: 'lan',
      latest_sync_event: { id: 'event-1', status: 'failed' },
      remote_peer_name: 'Foliole Desktop on Windows',
      reverse_policy: 'forbidden'
    });
  });

  it('blocks loopback reverse when the Windows client is not the paired sync peer', () => {
    expect(diagnoseAndroidSyncTopology({
      executorDeviceId: 'a5-device',
      pairingState,
      syncState: { endpoint_url: 'http://10.0.2.2:38641', sync_events: [] },
      windowsClient: { peer_id: 'other-peer' }
    })).toMatchObject({
      endpoint_kind: 'loopback',
      reverse_policy: 'blocked',
      windows_equals_sync_peer: false
    });
  });
});
