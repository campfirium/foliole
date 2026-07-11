import { vi } from 'vitest';

export function createConnectedProps() {
  return {
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    desktopDiscoveries: [],
    desktopDiscovery: null,
    endpointUrl: 'http://10.0.2.2:38641',
    error: null,
    handoffReminderSettings: {
      fixedTime: null,
      shortDelay: 'off' as const
    },
    lastSyncedAt: null,
    rememberedTargets: [],
    syncConflictCount: 0,
    syncEvents: [],
    syncProgress: null,
    onCancelPairing: vi.fn(),
    onCheckDesktop: vi.fn(async () => undefined),
    onChangeHandoffReminderSettings: vi.fn(),
    onClearError: vi.fn(),
    onCompletePairing: vi.fn(async () => undefined),
    onPull: vi.fn(async () => undefined),
    onRemoveRememberedTarget: vi.fn(async () => undefined),
    onRequestPrimaryDeviceTakeover: vi.fn(async () => undefined),
    onRequestPairing: vi.fn(async () => undefined),
    onSaveEndpoint: vi.fn(async () => undefined),
    onOpenSettingsPage: vi.fn(),
    page: 'sync' as const,
    pairingRequest: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      negotiated_protocol_version: 1,
      paired_at: '2026-04-22T09:00:00.000Z',
      primary_device_id: 'android-test-device',
      remote_protocol: {
        capabilities: ['lan-sync-v1'],
        max_supported_version: 1,
        min_supported_version: 1,
        version: 1
      },
      sync_usable: true
    },
    pairingStatus: 'idle' as const,
    status: 'idle' as const
  };
}

function syncEvent(
  id: string,
  message: string,
  status: 'completed' | 'failed' | 'skipped',
  occurredAt = '2026-04-29T02:24:44.000Z'
) {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id,
    message,
    occurred_at: occurredAt,
    status
  };
}

export function completedEvent() {
  return syncEvent('completed-event', 'Auto sync completed.', 'completed');
}

export function failedEvent() {
  return syncEvent(
    'failed-event',
    'Desktop sync timed out while fetching content blobs.',
    'failed',
    '2026-04-29T02:18:33.000Z'
  );
}

export function backlogEvent() {
  return syncEvent('backlog-event', 'Some topic bodies are still downloading.', 'skipped');
}
