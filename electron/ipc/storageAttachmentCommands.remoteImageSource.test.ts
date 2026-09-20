// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRemoteImageMetadata: vi.fn(),
  normalizeRemoteImageSourceOrigin: vi.fn((value: string) => value),
  resolveRemoteImageSourceContext: vi.fn(),
}));

vi.mock('../attachments/attachmentImageActions.js', () => ({
  copyAttachmentImageToClipboard: vi.fn(), exportAttachmentImage: vi.fn()
}));
vi.mock('../attachments/importClipboardImageAttachment.js', () => ({ importClipboardImageAttachment: vi.fn() }));
vi.mock('../attachments/importLocalImageAttachment.js', () => ({ importLocalImageAttachment: vi.fn() }));
vi.mock('../attachments/importRemoteImageAttachment.js', () => ({ importRemoteImageAttachment: vi.fn() }));
vi.mock('../attachments/remoteImageLearnedSources.js', () => ({
  forgetRemoteImageLearnedSource: vi.fn(), learnRemoteImageSourceOrigin: vi.fn(),
  normalizeRemoteImageSourceOrigin: mocks.normalizeRemoteImageSourceOrigin
}));
vi.mock('../attachments/remoteImageSourceContext.js', () => ({
  resolveRemoteImageSourceContext: mocks.resolveRemoteImageSourceContext
}));
vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageMetadata: mocks.fetchRemoteImageMetadata
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

it('loads metadata with the already resolved source context and retry intent', async () => {
  mocks.fetchRemoteImageMetadata.mockResolvedValue({ height: 240, width: 320 });

  await expect(handleStorageAttachmentCommand(NATIVE_COMMANDS.loadRemoteImageMetadata, {
    bypass_failure_cache: true,
    source_origin: 'https://source.example/',
    source_url: 'https://cdn.example/image.png'
  })).resolves.toEqual({ intrinsic_size: { height: 240, width: 320 } });
  expect(mocks.fetchRemoteImageMetadata).toHaveBeenCalledWith('https://cdn.example/image.png', {
    bypassFailureCache: true,
    sourceOrigin: 'https://source.example/'
  });
  expect(mocks.normalizeRemoteImageSourceOrigin).toHaveBeenCalledWith('https://source.example/');
  expect(mocks.resolveRemoteImageSourceContext).not.toHaveBeenCalled();
});

it('uses a direct metadata request when the resolved source context has no origin', async () => {
  mocks.fetchRemoteImageMetadata.mockResolvedValue(null);
  await expect(handleStorageAttachmentCommand(NATIVE_COMMANDS.loadRemoteImageMetadata, {
    source_origin: null, source_url: 'https://cdn.example/image.png'
  })).resolves.toEqual({ intrinsic_size: null });
  expect(mocks.fetchRemoteImageMetadata).toHaveBeenCalledWith('https://cdn.example/image.png', {
    bypassFailureCache: false, sourceOrigin: null
  });
  expect(mocks.resolveRemoteImageSourceContext).not.toHaveBeenCalled();
});
