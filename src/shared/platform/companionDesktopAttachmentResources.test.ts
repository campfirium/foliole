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

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companionWorkspacePairing', () => pairingMock);

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

describe('companion desktop attachment resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
  });

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

  it('skips attachment resource downloads outside native Android', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false);

    await expect(syncCompanionAttachmentResourcesFromDesktop('http://10.0.2.2:38641/', [
      attachmentRecord({ blob: { content_hash: 'blob-hash' } })
    ])).resolves.toEqual([]);

    expect(capacitorMock.plugin.syncAttachmentResource).not.toHaveBeenCalled();
  });
});
