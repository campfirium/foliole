// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveRemoteImageSourceContext: vi.fn()
}));

vi.mock('../attachments/attachmentImageActions.js', () => ({
  copyAttachmentImageToClipboard: vi.fn(), exportAttachmentImage: vi.fn()
}));
vi.mock('../attachments/importClipboardImageAttachment.js', () => ({ importClipboardImageAttachment: vi.fn() }));
vi.mock('../attachments/importLocalImageAttachment.js', () => ({ importLocalImageAttachment: vi.fn() }));
vi.mock('../attachments/importRemoteImageAttachment.js', () => ({ importRemoteImageAttachment: vi.fn() }));
vi.mock('../attachments/remoteImageLearnedSources.js', () => ({
  forgetRemoteImageLearnedSource: vi.fn(), learnRemoteImageSourceOrigin: vi.fn()
}));
vi.mock('../attachments/remoteImageSourceContext.js', () => ({
  resolveRemoteImageSourceContext: mocks.resolveRemoteImageSourceContext
}));
vi.mock('../attachments/resourceResolver.js', () => ({ resolveAttachmentResource: vi.fn() }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';

beforeEach(() => vi.clearAllMocks());

it('returns only normalized origin and provenance fields to the renderer', () => {
  mocks.resolveRemoteImageSourceContext.mockReturnValue({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://learned.example/',
    source: 'node',
    sourceOrigin: 'https://source.example/'
  });

  expect(handleStorageAttachmentCommand(NATIVE_COMMANDS.loadRemoteImageSourceContext, {
    node_id: 'node-1', source_url: 'https://cdn.example/image.png'
  })).toEqual({
    image_host: 'cdn.example',
    learned_source_origin: 'https://learned.example/',
    source: 'node',
    source_origin: 'https://source.example/'
  });
  expect(mocks.resolveRemoteImageSourceContext).toHaveBeenCalledWith(
    'node-1', 'https://cdn.example/image.png'
  );
});
