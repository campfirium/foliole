import { beforeEach, expect, it, type Mock, vi } from 'vitest';

const takeoverMocks = vi.hoisted(() => ({
  isNativeAndroidCompanionRuntime: vi.fn(() => true),
  loadCompanionPairingState: vi.fn(async () => ({
    device_id: 'device-android',
    device_kind: 'android',
    device_name: 'Pixel',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: 'device-desktop'
  })),
  plugin: {
    savePrimaryDeviceId: vi.fn(async () => ({
      device_id: 'device-android',
      device_kind: 'android',
      device_name: 'Pixel',
      is_paired: true,
      paired_at: '2026-05-10T00:00:00.000Z',
      primary_device_id: 'device-android'
    }))
  },
  postDesktopJson: vi.fn(async () => ({
    committed_at: '2026-05-10T00:01:00.000Z',
    primary_device_epoch: 1,
    primary_device_id: 'device-android',
    release_ack: true,
    updated_by_device_id: 'device-android'
  })),
  runSyncConvergenceCheck: vi.fn(async () => ({
    diagnostics: {
      android: {
        sync_state: {
          local_dirty_count: 0,
          pack_cursor: 42,
          pending_ack_count: 0,
          push_issue_count: 0
        }
      },
      desktop: {
        sync_state: {
          max_state_seq: 42
        }
      }
    },
    report: { status: 'converged' }
  }))
}));

vi.mock('./companionDesktopSyncHttp', () => ({
  postDesktopJson: takeoverMocks.postDesktopJson
}));
vi.mock('./companionSyncConvergence', () => ({
  runSyncConvergenceCheck: takeoverMocks.runSyncConvergenceCheck
}));
vi.mock('./companionWorkspacePairing', () => ({
  loadCompanionPairingState: takeoverMocks.loadCompanionPairingState
}));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: takeoverMocks.plugin,
  isNativeAndroidCompanionRuntime: takeoverMocks.isNativeAndroidCompanionRuntime
}));

beforeEach(() => {
  vi.clearAllMocks();
  takeoverMocks.isNativeAndroidCompanionRuntime.mockReturnValue(true);
});

it('requests takeover only after convergence and stores the released primary id locally', async () => {
  const { requestPrimaryDeviceTakeover } = await import('./companionPrimaryDeviceTakeover');

  const response = await requestPrimaryDeviceTakeover('http://127.0.0.1:38641');

  expect(takeoverMocks.postDesktopJson).toHaveBeenCalledWith(
    'http://127.0.0.1:38641',
    '/companion/primary-device/takeover',
    {
      android_pack_cursor: 42,
      candidate_device_id: 'device-android',
      desktop_max_state_seq: 42,
      local_dirty_count: 0,
      pending_ack_count: 0,
      push_issue_count: 0
    }
  );
  expect(takeoverMocks.plugin.savePrimaryDeviceId).toHaveBeenCalledWith({
    primary_device_id: 'device-android'
  });
  expect(response.release_ack).toBe(true);
});

it('blocks takeover when convergence is still pending', async () => {
  (takeoverMocks.runSyncConvergenceCheck as Mock).mockResolvedValueOnce({
    diagnostics: {
      android: {
        sync_state: {
          local_dirty_count: 0,
          pack_cursor: null,
          pending_ack_count: 0,
          push_issue_count: 0
        }
      },
      desktop: {
        sync_state: {
          max_state_seq: null
        }
      }
    },
    report: { status: 'pending' }
  });
  const { requestPrimaryDeviceTakeover } = await import('./companionPrimaryDeviceTakeover');

  await expect(requestPrimaryDeviceTakeover('http://127.0.0.1:38641')).rejects.toThrow(
    'This device must sync to the latest desktop state before becoming primary.'
  );
  expect(takeoverMocks.postDesktopJson).not.toHaveBeenCalled();
});
