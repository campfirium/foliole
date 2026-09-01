import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importGuidedSampleTopicAssets } from './guidedSampleAssetImports';

const { importClipboardImageAttachmentBytes } = vi.hoisted(() => ({
  importClipboardImageAttachmentBytes: vi.fn(async () => ({ status: 'imported' }))
}));

vi.mock('../../../shared/platform/attachmentImports', () => ({ importClipboardImageAttachmentBytes }));

function responseFor(bytes: Uint8Array) {
  return {
    arrayBuffer: async () => bytes.buffer,
    ok: true
  } as Response;
}

describe('importGuidedSampleTopicAssets', () => {
  beforeEach(() => {
    importClipboardImageAttachmentBytes.mockClear();
  });

  it('imports packaged guided sample image bytes into the created Topic', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor(new Uint8Array([1, 2, 3])));

    await importGuidedSampleTopicAssets('node-1', {
      attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b']
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('guided-sample-assets/58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png'));
    expect(importClipboardImageAttachmentBytes).toHaveBeenCalledWith({
      bytesBase64: 'AQID',
      mimeType: 'image/png',
      nodeId: 'node-1',
      originalName: '58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png'
    });

    fetchMock.mockRestore();
  });
});
