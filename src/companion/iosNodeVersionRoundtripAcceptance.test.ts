import { expect, it, vi } from 'vitest';

import {
  IOS_SYNC_PACK_CAPTURED_AT,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_MUTATION_AUTHOR,
  IOS_SYNC_PACK_RESTORED_AT,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(), loadWorkspace: vi.fn(), request: vi.fn(), restore: vi.fn()
}));

vi.mock('./iosAcceptanceRequestSync', () => ({ syncIosAcceptanceRequest: mocks.request }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({ loadCompanionWorkspaceSyncState: mocks.loadWorkspace }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  supportsCompanionNodeMutationSurface: () => false
}));
vi.mock('./companionCaptureTextActions', () => ({ persistCompanionCapturedText: mocks.capture }));
vi.mock('./companionTrashActions', () => ({ restoreCompanionTrashNode: mocks.restore }));

import { runIosNodeVersionRoundtripAcceptance } from './iosNodeVersionRoundtripAcceptance';

it('preserves capture and restore facts from the current request workspace snapshot', async () => {
  const snapshot = { nodesById: { 'ios-acceptance-restore': { currentVersionId: 'contract-version' } } };
  const capturedSnapshot = { nodesById: { ...snapshot.nodesById, 'capture-1': { currentVersionId: IOS_SYNC_PACK_CAPTURE_VERSION_ID } } };
  mocks.loadWorkspace.mockResolvedValue({ workspace_snapshot: snapshot });
  mocks.capture.mockResolvedValue({ nodeId: 'capture-1', snapshot: capturedSnapshot });
  mocks.restore.mockResolvedValue({ nodeId: 'ios-acceptance-restore', snapshot });
  mocks.request.mockResolvedValue({ pushConflictCount: 0, pushError: null, pushRejectedCount: 0 });

  await runIosNodeVersionRoundtripAcceptance('http://desktop.local', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'acceptance-desktop'
  });

  expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    now: IOS_SYNC_PACK_CAPTURED_AT,
    snapshot,
    text: 'iOS quick capture acceptance',
    versionId: IOS_SYNC_PACK_CAPTURE_VERSION_ID
  }));
  expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    nodeId: 'ios-acceptance-restore',
    now: IOS_SYNC_PACK_RESTORED_AT,
    snapshot: capturedSnapshot,
    versionId: IOS_SYNC_PACK_RESTORE_VERSION_ID
  }));
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenNthCalledWith(1, 'http://desktop.local', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'acceptance-desktop'
  });
  expect(mocks.request).toHaveBeenNthCalledWith(2, 'http://desktop.local', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'acceptance-desktop'
  });
});
