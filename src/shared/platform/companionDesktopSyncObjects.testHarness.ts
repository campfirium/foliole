import { vi } from 'vitest';

type DesktopSyncPackApplyResult = {
  participating_article_ids?: string[];
  applied_blob_count: number;
  applied_object_count: number;
  applied_review_op_ids?: string[];
  to_state_seq: number;
};

export const syncBridgeMock = {
  applyCompanionDesktopSyncPack: vi.fn(async (): Promise<DesktopSyncPackApplyResult> => ({
    participating_article_ids: ['article'],
    applied_blob_count: 2,
    applied_object_count: 3,
    to_state_seq: 8
  })),
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobBatch: vi.fn(async (limit: number) => {
    const blobs = await syncBridgeMock.loadCompanionMissingContentBlobs(limit);
    return { blobs, failedBytes: null, failedCount: null, hashes: blobs.map((blob) => blob.hash), total: null, totalBytes: null };
  }),
  loadCompanionMissingContentBlobs: vi.fn<(_limit?: number) => Promise<Array<{ hash: string; size_bytes?: number }>>>(
    async () => []
  ),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncReviewLog: vi.fn(async () => [] as Array<{ op_id: string; reviewed_at: string }>),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async () => null as { change_id: string; created_at: string } | null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async () => undefined),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash })),
  syncCompanionContentBlobs: vi.fn(async ({ body }: { body: string }) => ({
    synced_hashes: JSON.parse(body).hashes as string[]
  }))
};

export const attachmentResourceMock = {
  ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT: 6,
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>,
    onSyncedChunk?: (attachmentIds: string[]) => void
  ) => {
    const syncedIds = requests.map((request) => request.attachmentId);
    onSyncedChunk?.(syncedIds);
    return syncedIds;
  })
};

export const articleNeedsMock = vi.fn<(ids: readonly string[]) => Promise<Array<{
  attachment_id: string; content_hash: string; mime_type?: string; storage_key?: string; size_bytes?: number
}>>>().mockResolvedValue([]);

vi.mock('./companion/sync/resources/articleAttachmentNeeds', () => ({
  loadCompanionArticleAttachmentNeeds: async (_endpoint: string, ids: readonly string[]) => ({
    needs: (await articleNeedsMock(ids)).map((row) => ({ attachmentId: row.attachment_id,
      contentHash: row.content_hash, mimeType: row.mime_type ?? 'image/png',
      storageKey: row.storage_key ?? `${row.content_hash}.png`, sizeBytes: row.size_bytes })),
    unreadableArticleIds: []
  })
}));

export const attachmentResolutionMock = {
  resolveRuntimeAttachmentResource: vi.fn(async () => ({ status: 'missing_file' })),
  invalidateAttachmentResourceResolution: vi.fn()
};

const signedRequestMock = {
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Authorization-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  })),
  prepareNativeCompanionWorkgroupRequestIfPresent: vi.fn(async () => null)
};

export const capacitorMock = {
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    desktopHttpRequest: vi.fn()
  }
};

export const diagnosticsMock = {
  loadDesktopSyncDiagnostics: vi.fn(async (): Promise<unknown> => null),
  loadLocalSyncDiagnostics: vi.fn(async (): Promise<unknown> => null)
};

function resetSignedRequestMocks() {
  signedRequestMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Authorization-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }));
}

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => attachmentResourceMock);
vi.mock('./attachmentResources', () => attachmentResolutionMock);
vi.mock('./companion/sync/diagnostics/companionSyncDiagnostics', () => diagnosticsMock);
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerHostName: vi.fn(async () => 'Desktop Test Host'),
  resolveCompanionSyncPeerId: vi.fn(async () => 'desktop-test-device')
}));
vi.mock('./companion/network/signedRequest', () => ({
  createSignedRequestHeaders: signedRequestMock.createSignedRequestHeaders,
  prepareNativeCompanionWorkgroupRequestIfPresent: signedRequestMock.prepareNativeCompanionWorkgroupRequestIfPresent
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

export function resetCompanionDesktopSyncMocks() {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  articleNeedsMock.mockResolvedValue([]);
  attachmentResolutionMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'missing_file' });
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
  capacitorMock.plugin.desktopHttpRequest.mockReset();
  syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
    participating_article_ids: ['article'],
    applied_blob_count: 2,
    applied_object_count: 3,
    to_state_seq: 8
  });
  syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingContentBlobBatch.mockImplementation(async (limit: number) => {
    const blobs = await syncBridgeMock.loadCompanionMissingContentBlobs(limit);
    return { blobs, failedBytes: null, failedCount: null, hashes: blobs.map((blob) => blob.hash), total: null, totalBytes: null };
  });
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncReviewLogPushCursor.mockResolvedValue(null);
  syncBridgeMock.saveCompanionSyncPackCursor.mockImplementation(async (cursor: number | null) => cursor);
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }));
  syncBridgeMock.syncCompanionContentBlobs.mockImplementation(async ({ body }: { body: string }) => ({
    synced_hashes: JSON.parse(body).hashes as string[]
  }));
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue(null);
  diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue(null);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementation(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>,
    onSyncedChunk?: (attachmentIds: string[]) => void
  ) => {
    const syncedIds = requests.map((request) => request.attachmentId);
    onSyncedChunk?.(syncedIds);
    return syncedIds;
  });
  attachmentResolutionMock.invalidateAttachmentResourceResolution.mockReset();
  resetSignedRequestMocks();
}

vi.mock('./companion/network/companionResourceProviders', () => import('./companion/network/resourceProviderTestSupport'));
