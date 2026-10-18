import { expect, it, vi } from 'vitest';

import { metadataOwner } from './companion/runtime/companionWorkspaceMetadata.testSupport';

const runtime = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: runtime.owner
}));

it('serializes native workspace sync metadata writes', async () => {
  const { owner, connection, metadata } = await metadataOwner();
  runtime.owner.mockReturnValue(owner);
  const api = await import('./companionWorkspaceSync');
  await Promise.all([
    api.saveCompanionWorkspaceSyncEndpoint('http://10.0.2.2:38641'),
    api.removeCompanionWorkspaceSyncRememberedTarget('http://10.0.2.2:38641'),
    api.saveCompanionSyncOnboardingStatus('accepted'),
    api.recordCompanionWorkspaceSyncEvent({
      endpointUrl: 'http://10.0.2.2:38641', message: 'done',
      occurredAt: '2026-04-25T00:00:00.000Z', status: 'completed'
    })
  ]);
  expect(connection.commitTransaction).toHaveBeenCalledTimes(4);
  expect(connection.rollbackTransaction).not.toHaveBeenCalled();
  expect(metadata.get('workspace_sync_onboarding_status')).toBe('accepted');
  expect(JSON.parse(metadata.get('workspace_sync_remembered_targets')!)).toEqual([]);
  expect(JSON.parse(metadata.get('workspace_sync_events')!))
    .toEqual([expect.objectContaining({ message: 'done', status: 'completed' })]);
});
