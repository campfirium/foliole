import { act, render, renderHook, screen } from '@testing-library/react';
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

import { CompanionSyncPanel } from './CompanionSyncPanel';
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

it('finishes an approved replacement after the original request deadline', async () => {
  vi.useFakeTimers();
  runtime.request.mockResolvedValue({ endpoint_url: candidate.endpoint_url,
    expires_at: new Date(Date.now() + 1_000).toISOString(),
    group_id: candidate.group_id, request_id: 'slow-approved' });
  runtime.complete.mockRejectedValueOnce(new Error('sync_group_sync_incomplete'));
  const { result, unmount } = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(), onSaveEndpoint: vi.fn()
  }));
  try {
    await act(() => result.current.discover());
    act(() => runtime.callback?.({ candidates: [candidate], change: 'found',
      error_code: null, status: 'results' }));
    await act(() => result.current.request(candidate.endpoint_url));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(result.current.joined).toBe(false);
    runtime.loadGroup.mockResolvedValue({ group_id: candidate.group_id });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(result.current.joined).toBe(true);
  } finally {
    unmount();
    vi.useRealTimers();
  }
});

async function startPendingJoin() {
  runtime.request.mockResolvedValue({ endpoint_url: candidate.endpoint_url,
    expires_at: new Date(Date.now() + 1_000).toISOString(),
    group_id: candidate.group_id, request_id: 'expiring-request' });
  runtime.complete.mockRejectedValueOnce(new Error('sync_group_sync_incomplete'));
  const hook = renderHook(() => useCompanionSyncGroupJoin({
    bootstrapState: { database_path: '/library/foliole.db' } as never,
    onError: vi.fn(), onSaveEndpoint: vi.fn()
  }));
  await act(() => hook.result.current.discover());
  act(() => runtime.callback?.({ candidates: [candidate], change: 'found',
    error_code: null, status: 'results' }));
  await act(() => hook.result.current.request(candidate.endpoint_url));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  return hook;
}

it.each([null, { group_id: 'another-group' }])(
  'does not resume an expired request without matching membership: %j', async (group) => {
    vi.useFakeTimers();
    const { result, unmount } = await startPendingJoin();
    try {
      runtime.loadGroup.mockResolvedValue(group);
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(result.current.joined).toBe(false);
      expect(runtime.complete).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  }
);

it('does not resume when cancelled during the persisted membership check', async () => {
  vi.useFakeTimers();
  const { result, unmount } = await startPendingJoin();
  let resolveGroup: (group: { group_id: string }) => void = () => undefined;
  runtime.loadGroup.mockReturnValue(new Promise((resolve) => { resolveGroup = resolve; }));
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => result.current.cancel());
    await act(async () => { resolveGroup({ group_id: candidate.group_id }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.joined).toBe(false);
    expect(result.current.pendingRequest).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(runtime.complete).toHaveBeenCalledTimes(1);
  } finally {
    unmount();
    vi.useRealTimers();
  }
});

it('does not show an approved request as expired while group data is still arriving', async () => {
  vi.useFakeTimers();
  const client = await vi.importActual<typeof import('../shared/platform/companionSyncGroupJoinClient')>(
    '../shared/platform/companionSyncGroupJoinClient');
  const { result, unmount } = await startPendingJoin();
  const group = { group_id: candidate.group_id,
    devices: [{ device_identity_key: candidate.provider_device_id }] };
  runtime.loadGroup.mockResolvedValue(group);
  runtime.complete.mockImplementation(client.completeCompanionSyncGroupJoin);
  let finishAdoption!: () => void;
  runtime.adopt.mockReturnValue(new Promise<void>((resolve) => { finishAdoption = resolve; }));
  let view: ReturnType<typeof render> | undefined;
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    view = render(<CompanionSyncPanel
      bootstrapState={{ database_path: '/library/foliole.db' } as never}
      discoveries={[]} endpointUrl={candidate.endpoint_url} error={null}
      joinRequest={result.current.pendingRequest} joinStatus={result.current.status}
      lastSyncedAt={null} rememberedTargets={[]} syncConflictCount={0}
      syncEvents={[]} syncProgress={null} syncGroup={null}
      onCancelJoin={result.current.cancel} onClearError={vi.fn()} onDiscover={vi.fn()}
      onLeaveSyncGroup={vi.fn()} onPull={vi.fn()} onRemoveRememberedTarget={vi.fn()}
      onRequestJoin={vi.fn()} onSaveEndpoint={vi.fn()} onOpenSettingsPage={vi.fn()}
      page="sync" status="idle" />);
    expect(screen.queryByText('companion.syncSetup.expired')).not.toBeInTheDocument();
    expect(screen.queryByText('companion.syncSetup.approval.title')).not.toBeInTheDocument();
    expect(screen.getByText('companion.syncSetup.receiving.title')).toBeInTheDocument();
    expect(result.current.joined).toBe(false);
    await act(async () => { finishAdoption(); });
    expect(result.current.joined).toBe(true);
  } finally {
    view?.unmount();
    unmount();
    vi.useRealTimers();
  }
});
