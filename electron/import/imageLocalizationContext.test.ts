// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRemoteImageResource: vi.fn(),
  importImageAttachmentResource: vi.fn()
}));

vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageResource: mocks.fetchRemoteImageResource
}));

vi.mock('../attachments/importImageAttachmentResource.js', () => ({
  importImageAttachmentResource: mocks.importImageAttachmentResource
}));

vi.mock('../database/attachments.js', () => ({
  createNodeAttachmentLink: vi.fn()
}));

import { ImageLocalizationContext } from './imageLocalizationContext.js';

const largePngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x05, 0x00,
  0x00, 0x00, 0x03, 0xc0
]);

beforeEach(() => {
  mocks.fetchRemoteImageResource.mockResolvedValue({
    resource: {
      bytes: largePngBytes,
      mimeType: 'image/png',
      originalName: 'image.png',
      sourceUrl: 'https://cdn.example.com/image.png'
    },
    status: 'ok'
  });
  mocks.importImageAttachmentResource.mockResolvedValue({
    attachment_id: 'attachment-large-image',
    original_name: 'image.png',
    status: 'ok'
  });
});

it('turns localized large inline images into independent blocks', async () => {
  const context = new ImageLocalizationContext();

  await expect(context.localizeMarkdown('Lead ![](https://cdn.example.com/image.png) trailing')).resolves.toEqual({
    attachmentIds: ['attachment-large-image'],
    degradedMessages: [],
    text: 'Lead\n\n![](asset://attachment-large-image.png)\n\ntrailing'
  });
});
