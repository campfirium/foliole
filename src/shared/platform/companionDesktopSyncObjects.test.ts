import { beforeEach, expect, it, vi } from 'vitest';

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';
import { createEmptyResourceStages } from './companionDesktopSyncResourceStages';

const runtime = vi.hoisted(() => ({ round: vi.fn(), resources: vi.fn(),
  legacy: vi.fn(), localDiagnostics: vi.fn(), remoteDiagnostics: vi.fn() }));
vi.mock('./companion/sync/syncGroupIdentityRound', () => ({ runCompanionSyncIdentityRound: runtime.round }));
vi.mock('./companion/sync/syncGroupIdentityResources', () => ({ drainCompanionSyncIdentityResources: runtime.resources }));
vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({ loadIosCompanionHostName: async () => 'Phone' }));
vi.mock('./companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: async () => ({ group_id: 'group' }) }));
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({ resolveCompanionSyncPeerId: async () => 'peer' }));
vi.mock('./companionSyncObjects', () => ({ applyCompanionDesktopSyncPack: runtime.legacy }));
vi.mock('./companion/sync/diagnostics/companionSyncDiagnostics', () => ({
  loadLocalSyncDiagnostics: runtime.localDiagnostics, loadDesktopSyncDiagnostics: runtime.remoteDiagnostics
}));

const endpoint = 'http://current-peer.test';
function result() {
  return { received: { appliedObjects: 3 }, resources: { stages: createEmptyResourceStages() } };
}
beforeEach(() => {
  vi.resetAllMocks();
  runtime.localDiagnostics.mockResolvedValue(null);
  runtime.round.mockResolvedValue(result());
  runtime.resources.mockResolvedValue({ syncedCount: 0, stages: createEmptyResourceStages() });
});

it('returns current identity results without consulting legacy sequence diagnostics', async () => {
  await expect(syncCompanionObjectsFromDesktop(endpoint)).resolves.toMatchObject({
    appliedPackObjectCount: 3, remainingStructureChangeCount: 0, pushError: null
  });
  expect(runtime.legacy).not.toHaveBeenCalled();
  expect(runtime.remoteDiagnostics).not.toHaveBeenCalled();
});

it('keeps exclusive identity work pending through a long native apply', async () => {
  vi.useFakeTimers();
  try {
    let complete!: (value: ReturnType<typeof result>) => void;
    runtime.round.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = syncCompanionObjectsFromDesktop(endpoint, { includeResources: false });
    let settled = false;
    pending.finally(() => { settled = true; }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(runtime.legacy).not.toHaveBeenCalled();
    complete(result());
    await expect(pending).resolves.toMatchObject({ appliedPackObjectCount: 3 });
  } finally { vi.useRealTimers(); }
});

it('rejects an incompatible identity peer without a sequence fallback and permits an upgraded retry', async () => {
  runtime.round.mockRejectedValueOnce(new Error('sync_protocol_version_incompatible'));
  await expect(syncCompanionObjectsFromDesktop(endpoint)).rejects.toThrow('sync_protocol_version_incompatible');
  expect(runtime.legacy).not.toHaveBeenCalled();
  await expect(syncCompanionObjectsFromDesktop(endpoint)).resolves.toMatchObject({ appliedPackObjectCount: 3 });
  expect(runtime.round).toHaveBeenCalledTimes(2);
});

it('continues resources without a structure exchange or a false structure completion', async () => {
  const stages = { ...createEmptyResourceStages(), syncedContentBlobHashes: ['body'], syncedContentBlobBytes: 1024 };
  runtime.resources.mockResolvedValueOnce({ syncedCount: 1, stages });
  await expect(syncCompanionObjectsFromDesktop(endpoint, { resourcesOnly: true })).resolves.toMatchObject({
    appliedPackObjectCount: 0, remainingStructureChangeCount: null,
    syncedContentBlobHashes: ['body'], syncedContentBlobBytes: 1024
  });
  expect(runtime.round).not.toHaveBeenCalled();
  expect(runtime.resources).toHaveBeenCalledWith({ endpointUrl: endpoint, groupId: 'group', peerId: 'peer', onProgress: undefined });
  expect(runtime.remoteDiagnostics).not.toHaveBeenCalled();
});

it('does not expose the retired state diff bootstrap path', async () => {
  expect('bootstrapCompanionFromDesktopState' in await import('./companionDesktopSyncObjects')).toBe(false);
});
