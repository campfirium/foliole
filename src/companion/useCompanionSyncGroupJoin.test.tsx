import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract';

vi.mock('../shared/localization/LocalizationProvider', () => ({ useTranslation: () => (key: string) => key }));
const choice = vi.hoisted(() => ({ select: vi.fn(async () => 'use-group' as string | null) }));
vi.mock('../shared/ui/chooseSyncGroupJoinMode', () => ({ chooseSyncGroupJoinMode: choice.select }));

const runtime = vi.hoisted(() => ({
  callback: null as null | ((snapshot: SyncGroupDiscoverySnapshot) => void),
  complete: vi.fn(),
  loadGroup: vi.fn(),
  adopt: vi.fn(),
  request: vi.fn(),
  stop: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/completeCompanionSyncGroupAdoption', () => ({
  completeCompanionSyncGroupAdoption: runtime.adopt
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: runtime.loadGroup
}));
vi.mock('../shared/platform/companion/syncGroupDiscoverySession', () => ({
  startCompanionSyncGroupDiscoverySession: vi.fn(async (callback) => {
    runtime.callback = callback;
    return runtime.stop;
  })
}));
vi.mock('../shared/platform/companionSyncGroupJoinClient', () => ({
  cancelCompanionSyncGroupJoin: vi.fn(),
  completeCompanionSyncGroupJoin: runtime.complete,
  requestCompanionSyncGroupJoin: runtime.request
}));

import { useCompanionSyncGroupJoin } from './useCompanionSyncGroupJoin';

const candidate = {
  endpoint_url: 'http://device.local:38641',
  group_display_name: 'Foliole',
  group_id: 'group-1',
  group_tag: 'tag-1',
  provider_device_id: 'device-provider',
  provider_device_name: 'Provider',
  provider_platform: 'ios-capacitor'
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.callback = null;
  choice.select.mockResolvedValue('use-group');
  runtime.loadGroup.mockResolvedValue(null);
  runtime.adopt.mockResolvedValue(undefined);
  runtime.request.mockResolvedValue({
    endpoint_url: candidate.endpoint_url,
    expires_at: '2026-08-26T16:00:00.000Z',
    group_id: candidate.group_id,
    request_id: 'request-1'
  });
  runtime.complete.mockResolvedValue({ group_id: candidate.group_id });
});

it('completes an accepted request when the active discovery session publishes a later change', async () => {
  const onSaveEndpoint = vi.fn(async () => undefined);
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(),
    onSaveEndpoint
  }));

  await act(() => result.current.discover());
  act(() => runtime.callback?.({
    candidates: [candidate], change: 'found', error_code: null, status: 'results'
  }));
  await waitFor(() => expect(result.current.discoveries).toHaveLength(1));
  await act(() => result.current.request(candidate.endpoint_url));
  expect(result.current.status).toBe('awaiting-acceptance');

  act(() => runtime.callback?.({
    candidates: [candidate], change: 'changed', error_code: null, status: 'results'
  }));
  await waitFor(() => expect(result.current.joined).toBe(true));
  expect(runtime.complete).toHaveBeenCalledWith({
    databasePath: '/library/foliole.db',
    endpointUrl: candidate.endpoint_url,
    providerDeviceId: candidate.provider_device_id,
    providerDeviceName: candidate.provider_device_name,
    providerPlatform: candidate.provider_platform,
    requestId: 'request-1'
  });
  expect(result.current.pendingRequest).toBeNull();
});

it('polls for approval without requiring another discovery event', async () => {
  runtime.request.mockResolvedValueOnce({
    endpoint_url: candidate.endpoint_url,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    group_id: candidate.group_id,
    request_id: 'request-poll'
  });
  runtime.complete.mockRejectedValueOnce(new Error('sync_group_join_acceptance_http_409'));
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(),
    onSaveEndpoint: vi.fn(async () => undefined)
  }));

  await act(() => result.current.discover());
  act(() => runtime.callback?.({
    candidates: [candidate], change: 'found', error_code: null, status: 'results'
  }));
  await waitFor(() => expect(result.current.discoveries).toHaveLength(1));
  await act(() => result.current.request(candidate.endpoint_url));

  await waitFor(() => expect(result.current.joined).toBe(true), { timeout: 2_000 });
  expect(runtime.complete).toHaveBeenCalledTimes(2);
});

it('keeps approval polling active while discovery updates rerender the join screen', async () => {
  vi.useFakeTimers();
  runtime.request.mockResolvedValueOnce({
    endpoint_url: candidate.endpoint_url,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    group_id: candidate.group_id,
    request_id: 'request-rerenders'
  });
  runtime.complete.mockRejectedValueOnce(new Error('sync_group_join_acceptance_http_409'));
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(),
    onSaveEndpoint: vi.fn(async () => undefined)
  }));

  try {
    await act(() => result.current.discover());
    act(() => runtime.callback?.({
      candidates: [candidate], change: 'found', error_code: null, status: 'results'
    }));
    await act(async () => undefined);
    await act(() => result.current.request(candidate.endpoint_url));

    for (let elapsed = 0; elapsed < 1_500; elapsed += 100) {
      await act(async () => {
        vi.advanceTimersByTime(100);
        runtime.callback?.({
          candidates: [candidate], change: 'changed', error_code: null, status: 'results'
        });
      });
    }

    expect(result.current.joined).toBe(true);
    expect(runtime.complete).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('restores the join action and reports a Device request failure', async () => {
  const onError = vi.fn();
  runtime.request.mockRejectedValueOnce(new Error('device_identity_unavailable'));
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError,
    onSaveEndpoint: vi.fn(async () => undefined)
  }));

  await act(() => result.current.discover());
  act(() => runtime.callback?.({
    candidates: [candidate], change: 'found', error_code: null, status: 'results'
  }));
  await waitFor(() => expect(result.current.discoveries).toHaveLength(1));
  await act(async () => {
    await expect(result.current.request(candidate.endpoint_url))
      .rejects.toThrow('device_identity_unavailable');
  });
  await waitFor(() => expect(result.current.status).toBe('idle'));
  expect(onError).toHaveBeenLastCalledWith('device_identity_unavailable');
});

it.each(['overwrite', null])('requests membership only after choosing %s', async (mode) => {
  choice.select.mockResolvedValueOnce(mode);
  const onSaveEndpoint = vi.fn(async () => undefined);
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(), onSaveEndpoint
  }));
  await act(() => result.current.discover());
  act(() => runtime.callback?.({
    candidates: [candidate], change: 'found', error_code: null, status: 'results'
  }));
  await act(() => result.current.request(candidate.endpoint_url));
  if (mode === null) {
    expect(runtime.request).not.toHaveBeenCalled();
    expect(onSaveEndpoint).not.toHaveBeenCalled();
    expect(result.current.pendingRequest).toBeNull();
  } else {
    expect(runtime.request).toHaveBeenCalledWith(expect.objectContaining({ mode: 'overwrite' }));
  }
});

it('waits for a resumed local replacement before showing successful membership', async () => {
  let finish!: () => void;
  runtime.loadGroup.mockResolvedValue({ group_id: candidate.group_id });
  runtime.adopt.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(), onSaveEndpoint: vi.fn()
  }));
  await waitFor(() => expect(runtime.adopt).toHaveBeenCalledOnce());
  expect(result.current.joined).toBe(false);
  await act(async () => finish());
  expect(result.current.joined).toBe(true);
});

it('passes the group-to-device choice through the applicant UI', async () => {
  choice.select.mockResolvedValue('use-group');
  const { result } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(), onSaveEndpoint: vi.fn()
  }));
  await act(() => result.current.discover());
  act(() => runtime.callback?.({ candidates: [candidate], change: 'found', error_code: null, status: 'results' }));
  await act(() => result.current.request(candidate.endpoint_url));
  expect(runtime.request).toHaveBeenCalledWith(expect.objectContaining({ mode: 'use-group' }));
});
