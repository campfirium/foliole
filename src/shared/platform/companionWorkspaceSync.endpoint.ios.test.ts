import { expect, it, vi } from 'vitest';

import { metadataOwner } from './companion/runtime/companionWorkspaceMetadata.testSupport';
import { saveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSync';

const runtime = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: runtime.owner
}));


it('persists the current Mac sync address through the iOS state store', async () => {
  const { owner, metadata } = await metadataOwner([
    ['workspace_sync_endpoint_url', 'http://192.168.1.5:38641'],
    ['workspace_sync_remembered_targets', '["http://192.168.1.5:38641"]'],
    ['workspace_sync_onboarding_status', 'accepted']
  ]);
  runtime.owner.mockReturnValue(owner);
  await expect(saveCompanionWorkspaceSyncEndpoint('http://192.168.1.8:38641/')).resolves.toMatchObject({
    endpoint_url: 'http://192.168.1.8:38641',
    remembered_targets: ['http://192.168.1.8:38641', 'http://192.168.1.5:38641']
  });
  expect(metadata.get('workspace_sync_endpoint_url')).toBe('http://192.168.1.8:38641');
  expect(JSON.parse(metadata.get('workspace_sync_remembered_targets')!))
    .toEqual(['http://192.168.1.8:38641', 'http://192.168.1.5:38641']);
  expect(metadata.get('workspace_sync_onboarding_status')).toBe('accepted');
});
