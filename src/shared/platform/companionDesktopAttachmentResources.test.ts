import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  lastDownloadedAttachmentIds: [] as string[],
  plugin: {
    commitAttachmentResourceBatch: vi.fn(async () => ({
      synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
    })),
    downloadAttachmentResourceBatch: vi.fn(async ({ resources }: {
      resources: Array<{ attachment_id: string }>;
    }) => {
      capacitorMock.lastDownloadedAttachmentIds = resources.map((resource) => resource.attachment_id);
      return {
        batch_token: 'attachment-batch-token',
        failed_attachment_ids: [],
        synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
      };
    }),
    syncAttachmentResource: vi.fn(async () => ({ attachment_id: 'att-1', availability: 'cached' })),
    syncAttachmentResources: vi.fn(async ({ resources }: {
      resources: Array<{ attachment_id: string }>;
    }) => ({ synced_attachment_ids: resources.map((resource) => resource.attachment_id) }))
  }
}));
const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));
const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionMissingAttachmentResource: vi.fn(),
  loadCompanionMissingAttachmentResources: vi.fn()
}));
const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const iosDatabaseMock = vi.hoisted(() => ({
  commit: vi.fn(async () => ({ syncedIds: [] as string[] })), owner: {}
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companionWorkspacePairing', () => pairingMock);
vi.mock('./companionSyncObjects', () => syncObjectsMock);
vi.mock('./attachmentResources', () => ({
  invalidateAttachmentResourceResolution: vi.fn()
}));
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));
vi.mock('./companion/runtime/companionBatchDataPlane', () => ({
  commitStagedCompanionAttachmentBatch: iosDatabaseMock.commit
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: vi.fn(() => iosDatabaseMock.owner)
}));

import {
  syncCompanionAttachmentResourceRequestsFromDesktop,
  syncCompanionAttachmentResourcesFromDesktop,
  toAttachmentResourceRequest
} from './companionDesktopAttachmentResources';

function attachmentRecord(payload: unknown): NativeSyncObjectRecord {
  return {
    content_hash: 'state-hash',
    deleted_at: null,
    object_id: 'att-1',
    object_type: 'attachment',
    payload_json: JSON.stringify(payload),
    updated_at: '2026-04-25T00:00:00.000Z'
  };
}

function resetAttachmentResourceMocks() {
  vi.clearAllMocks();
  capacitorMock.plugin.commitAttachmentResourceBatch.mockReset();
  capacitorMock.plugin.downloadAttachmentResourceBatch.mockReset();
  capacitorMock.plugin.syncAttachmentResource.mockReset();
  capacitorMock.plugin.syncAttachmentResources.mockReset();
  capacitorMock.lastDownloadedAttachmentIds = [];
  capacitorMock.plugin.commitAttachmentResourceBatch.mockImplementation(async () => ({
    synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
  }));
  capacitorMock.plugin.downloadAttachmentResourceBatch.mockImplementation(async ({ resources }: {
    resources: Array<{ attachment_id: string }>;
  }) => {
    capacitorMock.lastDownloadedAttachmentIds = resources.map((resource) => resource.attachment_id);
    return {
      batch_token: 'attachment-batch-token',
      failed_attachment_ids: [],
      synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
    };
  });
  capacitorMock.plugin.syncAttachmentResource.mockResolvedValue({ attachment_id: 'att-1', availability: 'cached' });
  capacitorMock.plugin.syncAttachmentResources.mockImplementation(async ({ resources }: {
    resources: Array<{ attachment_id: string }>;
  }) => ({ synced_attachment_ids: resources.map((resource) => resource.attachment_id) }));
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  iosDatabaseMock.commit.mockImplementation(async () => ({ syncedIds: capacitorMock.lastDownloadedAttachmentIds }));
}

describe('companion desktop attachment resource manifests', () => {
  beforeEach(resetAttachmentResourceMocks);

  it('extracts attachment resource requests from manifest payloads', () => {
    expect(toAttachmentResourceRequest(attachmentRecord({
      blob: { content_hash: 'blob-hash' }
    }))).toEqual({ attachmentId: 'att-1', contentHash: 'blob-hash' });
  });

  it('downloads attachment resources during native Android sync', async () => {
    await expect(syncCompanionAttachmentResourcesFromDesktop('http://10.0.2.2:38641/', [
      attachmentRecord({ blob: { content_hash: 'blob-hash' } })
    ])).resolves.toEqual(['att-1']);

    expect(pairingMock.createSignedRequestHeaders).toHaveBeenCalledWith({
      endpointUrl: 'http://10.0.2.2:38641',
      method: 'GET',
      pathWithQuery: '/companion/attachment-resource?attachment_id=att-1&content_hash=blob-hash'
    });
    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledWith({
      resources: [{
        attachment_id: 'att-1',
        content_hash: 'blob-hash',
        headers: { 'X-Signature': 'signed' },
        url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-1&content_hash=blob-hash'
      }]
    });
    expect(iosDatabaseMock.commit).toHaveBeenCalledWith(
      iosDatabaseMock.owner, capacitorMock.plugin, 'attachment-batch-token'
    );
    expect(capacitorMock.plugin.syncAttachmentResources).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.downloadAttachmentResourceBatch.mock.invocationCallOrder[0]!)
      .toBeLessThan(iosDatabaseMock.commit.mock.invocationCallOrder[0]!);
  });

  it('downloads already enumerated missing attachment resources', async () => {
    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' }
    ])).resolves.toEqual(['att-2']);

    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledWith({
      resources: [{
        attachment_id: 'att-2',
        content_hash: 'blob-hash-2',
        headers: { 'X-Signature': 'signed' },
        url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-2&content_hash=blob-hash-2'
      }]
    });
    expect(iosDatabaseMock.commit).toHaveBeenCalledWith(
      iosDatabaseMock.owner, capacitorMock.plugin, 'attachment-batch-token'
    );
  });

  it('routes iOS attachment downloads through the same native bridge contract', async () => {
    capacitorMock.getPlatform.mockReturnValue('ios');

    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://192.168.1.2:38641/', [
      { attachmentId: 'att-ios', contentHash: 'hash-ios' }
    ])).resolves.toEqual(['att-ios']);

    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledTimes(1);
    expect(iosDatabaseMock.commit).toHaveBeenCalledWith(
      iosDatabaseMock.owner, capacitorMock.plugin, 'attachment-batch-token'
    );
    expect(capacitorMock.plugin.commitAttachmentResourceBatch).not.toHaveBeenCalled();
  });
});

describe('companion desktop attachment resource queue', () => {
  beforeEach(resetAttachmentResourceMocks);

  it('continues already enumerated attachment resources after one request fails', async () => {
    capacitorMock.plugin.downloadAttachmentResourceBatch.mockRejectedValueOnce(new Error('Batch failed.'));
    capacitorMock.plugin.downloadAttachmentResourceBatch
      .mockRejectedValueOnce(new Error('Desktop returned 404.'))
      .mockImplementationOnce(async ({ resources }: { resources: Array<{ attachment_id: string }> }) => {
        capacitorMock.lastDownloadedAttachmentIds = resources.map((resource) => resource.attachment_id);
        return {
          batch_token: 'attachment-batch-token',
          failed_attachment_ids: [],
          synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
        };
      });

    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' },
      { attachmentId: 'att-3', contentHash: 'blob-hash-3' }
    ])).resolves.toEqual(['att-3']);

    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledTimes(3);
    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.syncAttachmentResources).not.toHaveBeenCalled();
  });

  it('starts attachment resource downloads in a bounded parallel batch', async () => {
    let resolveFirst!: () => void;
    capacitorMock.plugin.downloadAttachmentResourceBatch.mockImplementationOnce(async ({ resources }: {
      resources: Array<{ attachment_id: string }>;
    }) => new Promise((resolve) => {
      capacitorMock.lastDownloadedAttachmentIds = resources.map((resource) => resource.attachment_id);
      resolveFirst = () => resolve({
        batch_token: 'attachment-batch-token',
        failed_attachment_ids: [],
        synced_attachment_ids: capacitorMock.lastDownloadedAttachmentIds
      });
    }));

    const download = syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' },
      { attachmentId: 'att-3', contentHash: 'blob-hash-3' }
    ]);

    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(() => {
      expect(capacitorMock.plugin.downloadAttachmentResourceBatch).toHaveBeenCalledTimes(1);
      expect(iosDatabaseMock.commit).not.toHaveBeenCalled();
    });
    resolveFirst();
    await expect(download).resolves.toEqual(['att-2', 'att-3']);
    expect(iosDatabaseMock.commit).toHaveBeenCalledTimes(1);
  });

  it('fails already enumerated attachment resources when the whole batch fails', async () => {
    capacitorMock.plugin.downloadAttachmentResourceBatch.mockRejectedValue(new Error('Desktop returned 404.'));

    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' },
      { attachmentId: 'att-3', contentHash: 'blob-hash-3' }
    ])).rejects.toThrow('Attachment batch could not download any requested file.');
  });
});

describe('companion desktop attachment resource runtime guard', () => {
  beforeEach(resetAttachmentResourceMocks);

  it('skips attachment resource downloads outside native Android', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false);

    await expect(syncCompanionAttachmentResourcesFromDesktop('http://10.0.2.2:38641/', [
      attachmentRecord({ blob: { content_hash: 'blob-hash' } })
    ])).resolves.toEqual([]);

    expect(capacitorMock.plugin.downloadAttachmentResourceBatch).not.toHaveBeenCalled();
  });
});
