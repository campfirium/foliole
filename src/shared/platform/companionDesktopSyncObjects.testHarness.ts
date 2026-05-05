import { vi } from 'vitest';

export const syncBridgeMock = {
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 2, applied_object_count: 3, to_state_seq: 8 })),
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobs: vi.fn(async () => [] as Array<{ hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncReviewLog: vi.fn(async () => [] as Array<{ op_id: string; reviewed_at: string }>),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async () => null as { change_id: string; created_at: string } | null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async () => undefined),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
};

export const attachmentResourceMock = {
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>
  ) => requests.map((request) => request.attachmentId))
};

export const pairingMock = {
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
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
  loadDesktopSyncDiagnostics: vi.fn(async () => null),
  loadLocalSyncDiagnostics: vi.fn(async () => null)
};

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => attachmentResourceMock);
vi.mock('./companionSyncDiagnostics', () => diagnosticsMock);
vi.mock('./companionWorkspacePairing', () => pairingMock);
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
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncReviewLogPushCursor.mockResolvedValue(null);
  syncBridgeMock.saveCompanionSyncPackCursor.mockImplementation(async (cursor: number | null) => cursor);
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }));
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue(null);
  diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue(null);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementation(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>
  ) => requests.map((request) => request.attachmentId));
  pairingMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }));
}
