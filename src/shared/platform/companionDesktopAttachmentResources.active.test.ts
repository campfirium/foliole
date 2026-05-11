import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    commitAttachmentResourceBatch: vi.fn(async () => ({ synced_attachment_ids: ['att-3'] })),
    downloadAttachmentResourceBatch: vi.fn(async () => ({
      batch_token: 'attachment-batch-token',
      failed_attachment_ids: [],
      synced_attachment_ids: ['att-3']
    })),
    syncAttachmentResource: vi.fn(),
    syncAttachmentResources: vi.fn()
  }
}));
const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));
const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionMissingAttachmentResource: vi.fn(async () => ({
    attachment_id: 'att-3',
    content_hash: 'blob-hash-3',
    size_bytes: 4096
  })),
  loadCompanionMissingAttachmentResources: vi.fn()
}));
const attachmentResourceCacheMock = vi.hoisted(() => ({
  invalidateAttachmentResourceResolution: vi.fn()
}));
const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./attachmentResources', () => attachmentResourceCacheMock);
vi.mock('./companionSyncObjects', () => syncObjectsMock);
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));
vi.mock('./companionWorkspacePairing', () => pairingMock);

import { syncCompanionAttachmentResourceFromDesktop } from './companionDesktopAttachmentResources';

function resetMocks() {
  vi.clearAllMocks();
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  capacitorMock.plugin.commitAttachmentResourceBatch.mockResolvedValue({ synced_attachment_ids: ['att-3'] });
  capacitorMock.plugin.downloadAttachmentResourceBatch.mockResolvedValue({
    batch_token: 'attachment-batch-token',
    failed_attachment_ids: [],
    synced_attachment_ids: ['att-3']
  });
  syncObjectsMock.loadCompanionMissingAttachmentResource.mockResolvedValue({
    attachment_id: 'att-3',
    content_hash: 'blob-hash-3',
    size_bytes: 4096
  });
}

describe('companion desktop active attachment resource priority', () => {
  beforeEach(resetMocks);

  it('downloads a missing attachment resource by attachment id for active item priority', async () => {
    await expect(syncCompanionAttachmentResourceFromDesktop('http://10.0.2.2:38641/', 'att-3')).resolves.toEqual({
      attachmentId: 'att-3',
      status: 'cached'
    });

    expect(syncObjectsMock.loadCompanionMissingAttachmentResource).toHaveBeenCalledWith('att-3');
    expect(syncObjectsMock.loadCompanionMissingAttachmentResources).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledWith({
      resources: [{
        attachment_id: 'att-3',
        content_hash: 'blob-hash-3',
        headers: { 'X-Signature': 'signed' },
        url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-3&content_hash=blob-hash-3'
      }]
    });
    expect(capacitorMock.plugin.syncAttachmentResources).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
    expect(attachmentResourceCacheMock.invalidateAttachmentResourceResolution).toHaveBeenCalledWith('att-3');
  });

  it('reports an attachment resource as not queued when it is not missing locally', async () => {
    (syncObjectsMock.loadCompanionMissingAttachmentResource as Mock).mockResolvedValue(null);

    await expect(syncCompanionAttachmentResourceFromDesktop('http://10.0.2.2:38641/', 'att-3')).resolves.toEqual({
      attachmentId: 'att-3',
      status: 'not_queued'
    });

    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).not.toHaveBeenCalled();
  });
});
