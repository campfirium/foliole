import { vi } from 'vitest';

// Substitute native host adapters, delegating to real SQLite and authenticated
// desktop HTTP implementations. Shared companion orchestration remains intact.
vi.mock('../../../src/shared/platform/companionRuntimeCapabilities.js', async (original) => {
  const actual = await original<typeof import('../../../src/shared/platform/companionRuntimeCapabilities.js')>();
  return { ...actual, getCompanionRuntimeCapability: () => ({ kind: 'android-native', platform: 'android' }),
    requireAvailableCompanionRuntime: () => ({ kind: 'android-native', platform: 'android' }) };
});
vi.mock('../../../src/shared/platform/companionWorkspaceRuntimeRepository.js', async (original) => {
  const actual = await original<typeof import('../../../src/shared/platform/companionWorkspaceRuntimeRepository.js')>();
  const { currentPeer } = await import('./scope.js');
  const { secret } = await import('./peers.js');
  const { createDesktopSyncGroupSignedHeaders } = await import('../../../electron/sync/desktopSyncGroupSignedHeaders.js');
  const { createDesktopFramedSyncFiles } = await import('../../../electron/sync/desktopFramedSyncFiles.js');
  const { postCompanionRequestFixture } = await import('../../../electron/sync/companionRequestSyncHttp.testSupport.js');
  const { postDesktopWorkgroupJson } = await import('../../../electron/sync/desktopSyncGroupHttp.js');
  return { ...actual, FolioleCompanionSync: { ...actual.FolioleCompanionSync,
    desktopHttpRequest: async (input: { url: string; body: string }) => {
      const url = new URL(input.url);
      const body = await postDesktopWorkgroupJson({ endpointUrl: url.origin, pathWithQuery: url.pathname + url.search,
        groupId: 'group', localDeviceId: currentPeer().id, secret, body: input.body });
      return { status: 200, body: JSON.stringify(body) };
    },
    signCompanionSyncRequest: async (args: { method: string; path_with_query: string; body_hash: string }) => ({ headers:
      createDesktopSyncGroupSignedHeaders({ method: args.method, pathWithQuery: args.path_with_query,
        bodySha256: args.body_hash, groupId: 'group', localDeviceId: currentPeer().id, secret }) }),
    postRequestSyncHttp: (input: import('../../../lib/platform/nativeRequestSyncHttpContract.js').NativeRequestSyncHttpRequest) =>
      postCompanionRequestFixture(createDesktopFramedSyncFiles(currentPeer().root + '/request-files'), input)
  }, getNativeCompanionSyncbackPlatform: () => 'android', isNativeCompanionNetworkRuntime: () => true };
});
vi.mock('../../../src/shared/platform/companionBootstrap.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { loadCompanionBootstrapState: async () => ({ host_name: currentPeer().name }) };
});
vi.mock('../../../src/shared/platform/companion/sync/syncGroupStore.js', async () => {
  const { loadDesktopSyncGroup } = await import('../../../electron/database/syncGroupStore.js');
  const { secret } = await import('./peers.js');
  return { loadCompanionSyncGroup: async () => loadDesktopSyncGroup(), loadCompanionSyncGroupWorkgroupKey: async () => secret };
});
vi.mock('../../../src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.js', async () => {
  const { companionPort } = await import('./companionPort.js');
  const { currentPeer } = await import('./scope.js');
  const { withRequestSyncReadonlySnapshot } = await import('../../../electron/database/requestSyncReadonlySnapshot.js');
  return { getIosCompanionDatabaseOwner: () => ({
    databasePath: currentPeer().dbPath,
    readSnapshot: (task: Parameters<typeof withRequestSyncReadonlySnapshot>[1]) => withRequestSyncReadonlySnapshot(currentPeer().dbPath, task),
    read: async (task: (db: ReturnType<typeof companionPort>) => unknown) => task(companionPort()),
    runWriter: async (task: (db: ReturnType<typeof companionPort>) => unknown) => task(companionPort())
  }) };
});
vi.mock('../../../src/shared/platform/companion/network/signedRequest.js', async () => {
  const { currentPeer } = await import('./scope.js');
  const { createDesktopSyncGroupSignedHeaders } = await import('../../../electron/sync/desktopSyncGroupHttp.js');
  const { secret } = await import('./peers.js');
  return { prepareNativeCompanionWorkgroupRequest: async (args: { bodyText: string }) => ({ body: args.bodyText, headers: {} }),
    createSignedRequestHeaders: async (args: { method: string; pathWithQuery: string; bodyText?: string }) =>
    createDesktopSyncGroupSignedHeaders({ ...args, groupId: 'group', localDeviceId: currentPeer().id, secret }) };
});
vi.mock('../../../src/shared/platform/companionDesktopSyncHttp.js', async (original) => {
  const actual = await original<typeof import('../../../src/shared/platform/companionDesktopSyncHttp.js')>();
  const { currentPeer } = await import('./scope.js');
  const { secret } = await import('./peers.js');
  const { fetchDesktopWorkgroupJson, postDesktopWorkgroupJson } = await import('../../../electron/sync/desktopSyncGroupHttp.js');
  const parameters = (endpointUrl: string, pathWithQuery: string) => ({ endpointUrl, pathWithQuery,
    groupId: 'group', localDeviceId: currentPeer().id, secret });
  return { ...actual,
    fetchDesktopJson: async (endpoint: string, route: string) => {
      try { return await fetchDesktopWorkgroupJson(parameters(endpoint, route)); }
      catch (error) {
        const match = String(error).match(/sync_group_http_(\d+):(.*)/);
        if (match) throw new actual.DesktopSyncHttpError(String(error), { status: Number(match[1]),
          path: route, body: JSON.stringify({ error: match[2] }) });
        throw error;
      }
    },
    postDesktopJson: async (endpoint: string, route: string, body: unknown) =>
      postDesktopWorkgroupJson({ ...parameters(endpoint, route), body: JSON.stringify(body) })
  };
});

vi.mock('../../../src/shared/platform/companion/runtime/companionFramedPayloadBudget.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { companionFramedFileOwner: () => ({ library_key: currentPeer().dbPath, generation_id: currentPeer().id }) };
});
vi.mock('../../../src/shared/platform/companion/sync/framed/companionFramedSyncFiles.js', async () => {
  const { currentPeer } = await import('./scope.js');
  const { createDesktopFramedSyncFiles } = await import('../../../electron/sync/desktopFramedSyncFiles.js');
  return { currentCompanionFramedSyncFiles: () => createDesktopFramedSyncFiles(currentPeer().root + '/request-files') };
});
vi.mock('../../../src/shared/platform/companion/sync/framed/companionAttachmentBlockFiles.js', async () => {
  const { createDesktopRequestSyncAttachmentHost } = await import('../../../electron/sync/desktopRequestSyncAttachmentHost.js');
  return { currentCompanionAttachmentHost: createDesktopRequestSyncAttachmentHost };
});
vi.mock('../../../src/shared/platform/appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined }));
