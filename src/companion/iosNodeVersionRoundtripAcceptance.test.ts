import { expect, it, vi } from 'vitest';

import {
  IOS_SYNC_PACK_CAPTURED_AT,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_MUTATION_AUTHOR,
  IOS_SYNC_PACK_RESTORED_AT,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(), capture: vi.fn(), loadWorkspace: vi.fn(),
  push: vi.fn(), restore: vi.fn(), sign: vi.fn()
}));

vi.mock('../shared/platform/companionDesktopSyncPush', () => ({ pushLocalDirtyObjects: mocks.push }));
vi.mock('../shared/platform/companionSyncPackApply', () => ({ applyCompanionDesktopSyncPack: mocks.apply }));
vi.mock('../shared/platform/companion/network/signedRequest', () => ({ createSignedRequestHeaders: mocks.sign }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({ loadCompanionWorkspaceSyncState: mocks.loadWorkspace }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  supportsCompanionNodeMutationSurface: () => false
}));
vi.mock('./companionCaptureTextActions', () => ({ persistCompanionCapturedText: mocks.capture }));
vi.mock('./companionTrashActions', () => ({ restoreCompanionTrashNode: mocks.restore }));

import { runIosNodeVersionRoundtripAcceptance } from './iosNodeVersionRoundtripAcceptance';

it('mutates the workspace snapshot produced by the applied contract pack', async () => {
  const snapshot = { nodesById: { 'ios-acceptance-restore': { currentVersionId: 'contract-version' } } };
  mocks.loadWorkspace.mockResolvedValue({ workspace_snapshot: snapshot });
  mocks.capture.mockResolvedValue({ nodeId: 'capture-1', snapshot });
  mocks.restore.mockResolvedValue({ nodeId: 'ios-acceptance-restore', snapshot });
  mocks.push.mockResolvedValue({ pushConflictCount: 0, pushError: null, pushRejectedCount: 0 });
  mocks.sign.mockResolvedValue({ 'X-Signature': 'signed' });

  await runIosNodeVersionRoundtripAcceptance('http://desktop.local', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'acceptance-desktop'
  });

  expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    now: IOS_SYNC_PACK_CAPTURED_AT,
    snapshot,
    versionId: IOS_SYNC_PACK_CAPTURE_VERSION_ID
  }));
  expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    now: IOS_SYNC_PACK_RESTORED_AT,
    snapshot,
    versionId: IOS_SYNC_PACK_RESTORE_VERSION_ID
  }));
  expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ sourcePeerId: 'acceptance-desktop' }));
});
