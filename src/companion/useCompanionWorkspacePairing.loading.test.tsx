import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

const syncMocks = vi.hoisted(() => ({
  discoverCompanionDesktop: vi.fn(),
  discoverCompanionDesktops: vi.fn(),
  loadCompanionPairingState: vi.fn(),
  pairCompanionWithDesktop: vi.fn(),
  requestCompanionPairing: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  discoverCompanionDesktop: syncMocks.discoverCompanionDesktop,
  discoverCompanionDesktops: syncMocks.discoverCompanionDesktops,
  loadCompanionPairingState: syncMocks.loadCompanionPairingState,
  pairCompanionWithDesktop: syncMocks.pairCompanionWithDesktop,
  requestCompanionPairing: syncMocks.requestCompanionPairing
}));

import { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';

function createArgs() {
  const bootstrapState: NativeCompanionBootstrapState = {
    booted_at: '2026-04-24T03:00:00.000Z',
    database_path: 'foliole-companionSQLite.db',
    database_ready: true,
    device_id: 'android-test-device',
    device_name: null,
    runtime_kind: 'android-capacitor'
  };
  return {
    bootstrapState,
    onError: vi.fn(),
    onSaveEndpoint: vi.fn(async () => undefined)
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('loads stored pairing state once on initial render', async () => {
  syncMocks.loadCompanionPairingState.mockResolvedValue({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null
  });
  const args = createArgs();

  const { rerender } = renderHook(() => useCompanionWorkspacePairing(args));
  rerender();
  rerender();

  await waitFor(() => {
    expect(syncMocks.loadCompanionPairingState).toHaveBeenCalledTimes(1);
  });
});
