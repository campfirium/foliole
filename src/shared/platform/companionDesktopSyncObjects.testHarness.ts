import { vi } from 'vitest';

type DesktopSyncPackApplyResult = {
  applied_blob_count: number;
  applied_object_count: number;
  applied_review_op_ids?: string[];
  to_state_seq: number;
};

export const syncBridgeMock = {
  applyCompanionDesktopSyncPack: vi.fn(async (): Promise<DesktopSyncPackApplyResult> => ({
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

export const attachmentResolutionMock = {
  invalidateAttachmentResourceResolution: vi.fn()
};

const pairingMock = {
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  })),
  loadCompanionPairingState: vi.fn(async () => ({
    device_id: 'android-test-device',
    device_kind: 'android',
    device_name: 'Android test device',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: 'android-test-device'
  }))
};

export const primaryDeviceIdentityMock = {
  saveLocalPrimaryDeviceId: vi.fn(async (primaryDeviceId: string) => ({
    device_id: 'android-test-device',
    device_kind: 'android',
    device_name: 'Android test device',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: primaryDeviceId
  }))
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

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => attachmentResourceMock);
vi.mock('./attachmentResources', () => attachmentResolutionMock);
vi.mock('./companion/sync/diagnostics/companionSyncDiagnostics', () => diagnosticsMock);
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: vi.fn(async () => 'desktop-test-device')
}));
vi.mock('./companionWorkspacePairing', () => pairingMock);
vi.mock('./companionPrimaryDeviceIdentity', () => primaryDeviceIdentityMock);
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
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
  capacitorMock.plugin.desktopHttpRequest.mockReset();
  syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
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
  pairingMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }));
  pairingMock.loadCompanionPairingState.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android',
    device_name: 'Android test device',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: 'android-test-device'
  });
  primaryDeviceIdentityMock.saveLocalPrimaryDeviceId.mockImplementation(async (primaryDeviceId: string) => ({
    device_id: 'android-test-device',
    device_kind: 'android',
    device_name: 'Android test device',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: primaryDeviceId
  }));
}
