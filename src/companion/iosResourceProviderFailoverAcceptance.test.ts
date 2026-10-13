// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), resource: vi.fn(), providers: vi.fn(),
  member: vi.fn(), group: vi.fn(), bootstrap: vi.fn(), article: vi.fn(),
  join: vi.fn(), complete: vi.fn(), discovery: vi.fn(), native: vi.fn(), workspace: vi.fn(),
  endpoint: vi.fn(), result: vi.fn() }));
vi.mock('./iosAcceptanceRequestSync', () => ({ syncIosAcceptanceRequest: mocks.sync }));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: mocks.result }));
vi.mock('../shared/platform/attachmentResources', () => ({ resolveRuntimeAttachmentResource: mocks.resource }));
vi.mock('../shared/platform/companion/network/companionResourceProviders', () => ({ loadCompanionResourceProviders: mocks.providers }));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({ exchangeCompanionSyncGroupMemberState: mocks.member }));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.group }));
vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.bootstrap }));
vi.mock('../shared/platform/companionReadableArticle', () => ({ resolveReadableCompanionArticleByNodeId: mocks.article }));
vi.mock('../shared/platform/companionSyncGroupJoinClient', () => ({ requestCompanionSyncGroupJoin: mocks.join,
  completeCompanionSyncGroupJoin: mocks.complete }));
vi.mock('../shared/platform/companionWorkspaceDiscovery', () => ({ loadCompanionDiscoveryCandidates: mocks.discovery }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { loadDiscoveryCandidates: mocks.native } }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({ loadCompanionWorkspaceSyncState: mocks.workspace,
  saveCompanionWorkspaceSyncEndpoint: mocks.endpoint }));
const hash = 'a'.repeat(64);
async function run() {
  const { runIosResourceProviderFailoverAcceptance } = await import('./iosResourceProviderFailoverAcceptance');
  await runIosResourceProviderFailoverAcceptance();
}
beforeEach(() => {
  vi.resetAllMocks(); vi.resetModules();
  for (const [key, value] of Object.entries({ GROUP_ID: 'group', MAC_ID: 'mac', A5_ID: 'a5', NODE_ID: 'node', IMAGE_HASH: hash })) {
    vi.stubEnv(`VITE_FOLIOLE_ACCEPTANCE_${key}`, value);
  }
  mocks.bootstrap.mockResolvedValue({ database_path: '/phone.db' });
  mocks.native.mockResolvedValue({ candidates: [] });
  mocks.discovery.mockResolvedValue([{ endpointUrl: 'http://mac', compatibility: { status: 'compatible' },
    discovery: { group_id: 'group', provider_device_id: 'mac', provider_device_name: 'Mac' } }]);
  mocks.group.mockResolvedValue(null); mocks.join.mockResolvedValue({ request_id: 'join' });
  mocks.providers.mockResolvedValue({ providers: ['mac', 'a5'].map(deviceId => ({ deviceId, endpointUrl: `http://${deviceId}`, groupId: 'group' })) });
  mocks.workspace.mockResolvedValue({ workspace_snapshot: {} });
  mocks.article.mockReturnValue({ bodyStatus: 'ready', content: `Resource LAN body remains readable. asset://${hash}.png` });
  mocks.resource.mockResolvedValue({ status: 'missing_file', resource_url: null });
  mocks.sync.mockImplementation(async (_endpoint, _peer, resourcesOnly) => {
    if (resourcesOnly) mocks.resource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://localhost/image.png' });
  });
});
it('observes the missing attachment after Mac then recovers it from the A5 resource request', async () => {
  await run();
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  expect(mocks.sync.mock.calls).toEqual([
    ['http://mac', { sourcePeerId: 'mac' }], ['http://a5', { sourcePeerId: 'a5' }, true]
  ]);
  expect(mocks.result).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'passed', phase: 'provider-selected',
    transfers: [
      expect.objectContaining({ device_id: 'mac', before: { attachment_status: 'missing_file', resource_url: null },
        after: expect.objectContaining({ article_body_status: 'ready', attachment_status: 'missing_file' }) }),
      expect.objectContaining({ device_id: 'a5', before: expect.objectContaining({ attachment_status: 'missing_file' }),
        after: expect.objectContaining({ attachment_status: 'ready', resource_url: 'capacitor://localhost/image.png' }) })
    ],
    evidence: { article_body_status: 'ready', attachment_status: 'ready', resource_url: 'capacitor://localhost/image.png' } }));
});
it('reads durable content after restart without joining or synchronizing again', async () => {
  mocks.group.mockResolvedValue({ group_id: 'group' });
  mocks.resource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://localhost/image.png' });
  await run();
  expect(mocks.sync).not.toHaveBeenCalled(); expect(mocks.join).not.toHaveBeenCalled();
  expect(mocks.result).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'passed', phase: 'restart-clean' }));
});
it('rejects an already present attachment before the Mac transfer', async () => {
  mocks.resource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://localhost/image.png' });
  await run();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.result).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', error: 'acceptance_attachment_already_available' }));
});
it('rejects an attachment filled early by the Mac stage instead of claiming A5 recovery', async () => {
  mocks.sync.mockImplementation(async () => {
    mocks.resource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://localhost/image.png' });
  });
  await run();
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith('http://mac', { sourcePeerId: 'mac' });
  expect(mocks.result).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', error: 'acceptance_attachment_already_available' }));
});
it.each(['body', 'url'])('rejects unreadable %s evidence', async kind => {
  if (kind === 'body') mocks.article.mockReturnValue({ bodyStatus: 'ready', content: 'wrong body' });
  else mocks.sync.mockImplementation(async (_endpoint, _peer, resourcesOnly) => {
    if (resourcesOnly) mocks.resource.mockResolvedValue({ status: 'ready', resource_url: null });
  });
  await run();
  expect(mocks.sync).toHaveBeenCalledTimes(kind === 'body' ? 1 : 2);
  expect(mocks.result).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', error: 'acceptance_article_or_attachment_unreadable' }));
});
