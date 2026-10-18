import { expect, it, vi } from 'vitest';

import { metadataOwner } from './companionWorkspaceMetadata.testSupport';
import { recordCompanionWorkspaceSyncEvent, saveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSync';

const runtime = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: runtime.owner
}));


it('serializes concurrent iOS metadata updates without losing either permanent field', async () => {
  const { owner, connection, metadata } = await metadataOwner();
  runtime.owner.mockReturnValue(owner);
  await Promise.all([
    saveCompanionWorkspaceSyncEndpoint('http://192.168.1.5:38641'),
    recordCompanionWorkspaceSyncEvent({
      endpointUrl: 'http://192.168.1.5:38641', message: 'Sync completed.',
      occurredAt: '2026-07-21T04:00:00.000Z', status: 'completed'
    })
  ]);
  expect(metadata.get('workspace_sync_endpoint_url')).toBe('http://192.168.1.5:38641');
  expect(JSON.parse(metadata.get('workspace_sync_remembered_targets')!)).toEqual(['http://192.168.1.5:38641']);
  expect(JSON.parse(metadata.get('workspace_sync_events')!))
    .toEqual([expect.objectContaining({ message: 'Sync completed.', status: 'completed' })]);
  expect(connection.commitTransaction).toHaveBeenCalledTimes(2);
  expect(connection.rollbackTransaction).not.toHaveBeenCalled();
});
