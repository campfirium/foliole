import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    syncAttachmentResource: vi.fn(async () => ({ attachment_id: 'att-1', availability: 'cached' }))
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
  loadCompanionMissingAttachmentResources: vi.fn(async () => [
    { attachment_id: 'att-3', content_hash: 'blob-hash-3', size_bytes: 4096 }
  ])
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

import {
  syncCompanionAttachmentResourceFromDesktop,
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
  capacitorMock.plugin.syncAttachmentResource.mockReset();
  capacitorMock.plugin.syncAttachmentResource.mockResolvedValue({ attachment_id: 'att-1', availability: 'cached' });
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  syncObjectsMock.loadCompanionMissingAttachmentResources.mockResolvedValue([
    { attachment_id: 'att-3', content_hash: 'blob-hash-3', size_bytes: 4096 }
  ]);
  syncObjectsMock.loadCompanionMissingAttachmentResource.mockResolvedValue({
    attachment_id: 'att-3',
    content_hash: 'blob-hash-3',
    size_bytes: 4096
  });
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
      method: 'GET',
      pathWithQuery: '/companion/attachment-resource?attachment_id=att-1&content_hash=blob-hash'
    });
    expect(capacitorMock.plugin.syncAttachmentResource).toHaveBeenCalledWith({
      attachment_id: 'att-1',
      content_hash: 'blob-hash',
      headers: { 'X-Signature': 'signed' },
      url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-1&content_hash=blob-hash'
    });
  });

  it('downloads already enumerated missing attachment resources', async () => {
    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' }
    ])).resolves.toEqual(['att-2']);

    expect(capacitorMock.plugin.syncAttachmentResource).toHaveBeenCalledWith({
      attachment_id: 'att-2',
      content_hash: 'blob-hash-2',
      headers: { 'X-Signature': 'signed' },
      url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-2&content_hash=blob-hash-2'
    });
  });
});

describe('companion desktop attachment resource queue', () => {
  beforeEach(resetAttachmentResourceMocks);

  it('continues already enumerated attachment resources after one request fails', async () => {
    capacitorMock.plugin.syncAttachmentResource
      .mockRejectedValueOnce(new Error('Desktop returned 404.'))
      .mockResolvedValueOnce({ attachment_id: 'att-3', availability: 'cached' });

    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' },
      { attachmentId: 'att-3', contentHash: 'blob-hash-3' }
    ])).resolves.toEqual(['att-3']);

    expect(capacitorMock.plugin.syncAttachmentResource).toHaveBeenCalledTimes(2);
  });

  it('fails already enumerated attachment resources when the whole batch fails', async () => {
    capacitorMock.plugin.syncAttachmentResource.mockRejectedValue(new Error('Desktop returned 404.'));

    await expect(syncCompanionAttachmentResourceRequestsFromDesktop('http://10.0.2.2:38641/', [
      { attachmentId: 'att-2', contentHash: 'blob-hash-2' },
      { attachmentId: 'att-3', contentHash: 'blob-hash-3' }
    ])).rejects.toThrow('Attachment batch could not download any requested file.');
  });

  it('downloads a missing attachment resource by attachment id for active item priority', async () => {
    await expect(syncCompanionAttachmentResourceFromDesktop('http://10.0.2.2:38641/', 'att-3')).resolves.toEqual({
      attachmentId: 'att-3',
      status: 'cached'
    });

    expect(syncObjectsMock.loadCompanionMissingAttachmentResource).toHaveBeenCalledWith('att-3');
    expect(syncObjectsMock.loadCompanionMissingAttachmentResources).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.syncAttachmentResource).toHaveBeenCalledWith({
      attachment_id: 'att-3',
      content_hash: 'blob-hash-3',
      headers: { 'X-Signature': 'signed' },
      url: 'http://10.0.2.2:38641/companion/attachment-resource?attachment_id=att-3&content_hash=blob-hash-3'
    });
  });

  it('reports an attachment resource as not queued when it is not missing locally', async () => {
    syncObjectsMock.loadCompanionMissingAttachmentResource.mockResolvedValue(null);

    await expect(syncCompanionAttachmentResourceFromDesktop('http://10.0.2.2:38641/', 'att-3')).resolves.toEqual({
      attachmentId: 'att-3',
      status: 'not_queued'
    });

    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
  });

  it('skips attachment resource downloads outside native Android', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false);

    await expect(syncCompanionAttachmentResourcesFromDesktop('http://10.0.2.2:38641/', [
      attachmentRecord({ blob: { content_hash: 'blob-hash' } })
    ])).resolves.toEqual([]);

    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
  });
});
