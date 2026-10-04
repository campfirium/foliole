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
  const native = await import('./companionIdentityNativeAdapter.js');
  return { ...actual, getNativeCompanionSyncbackPlatform: () => 'android', isNativeCompanionNetworkRuntime: () => false,
    FolioleCompanionSync: { ...actual.FolioleCompanionSync,
      createIdentitySourceView: native.createNativeIdentityView,
      buildIdentitySourcePack: native.buildNativeIdentityPack,
      closeIdentitySourceView: native.closeNativeIdentityView } };
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
  return { getIosCompanionDatabaseOwner: () => ({
    platform: 'android',
    read: async (task: (db: ReturnType<typeof companionPort>) => unknown) => task(companionPort()),
    runWriter: async (task: (db: ReturnType<typeof companionPort>) => unknown) => task(companionPort())
  }) };
});
vi.mock('../../../src/shared/platform/companion/network/signedRequest.js', async () => {
  const { currentPeer } = await import('./scope.js');
  const { createDesktopSyncGroupSignedHeaders } = await import('../../../electron/sync/desktopSyncGroupHttp.js');
  const { createDesktopWorkgroupPost } = await import('../../../electron/sync/desktopSyncGroupHttp.js');
  const { secret } = await import('./peers.js');
  return { createSignedRequestHeaders: async (args: { method: string; pathWithQuery: string; bodyText?: string }) =>
    createDesktopSyncGroupSignedHeaders({ ...args, groupId: 'group', localDeviceId: currentPeer().id, secret }),
    prepareNativeCompanionWorkgroupRequest: async (args: { bodyText: string; pathWithQuery: string }) =>
      createDesktopWorkgroupPost({ body: args.bodyText, pathWithQuery: args.pathWithQuery,
        groupId: 'group', localDeviceId: currentPeer().id, secret }) };
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
vi.mock('../../../src/shared/platform/companionSyncPackTransfer.js', async () => {
  const { downloadNativeAdapter, deleteNativeAdapter } = await import('./companionTransfer.js');
  const { downloadNativeIdentityPack } = await import('./companionIdentityNativeAdapter.js');
  return { downloadCompanionDesktopSyncPack: downloadNativeAdapter,
    downloadCompanionDesktopSyncIdentityPack: downloadNativeIdentityPack,
    deleteCompanionDownloadedSyncPack: deleteNativeAdapter };
});
