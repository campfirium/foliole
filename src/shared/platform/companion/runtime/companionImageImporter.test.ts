import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ readRemoteImageResponse: vi.fn(), writeImageAttachment: vi.fn() }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: native }));
vi.mock('../../companionRuntimeCapabilities', () => ({ requireAvailableCompanionRuntime: vi.fn() }));

import { importCompanionImageResource } from './companionImageImporter';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
beforeEach(() => {
  vi.resetAllMocks();
  native.writeImageAttachment.mockResolvedValue({ storedFile: 'created' });
});

it('imports changed remote content under its own canonical identity', async () => {
  native.readRemoteImageResponse.mockResolvedValue({ status: 200, bytesBase64: png });
  const image = await importCompanionImageResource('https://images.example/image.png');
  expect(image.storageKey).toBe(`${image.contentHash}.png`);
  expect(image.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(native.writeImageAttachment).toHaveBeenCalledWith({ bytesBase64: png,
    contentHash: image.contentHash, mimeType: 'image/png', storageKey: image.storageKey });
});

it('rejects a redirect into local infrastructure before a second native request', async () => {
  native.readRemoteImageResponse.mockResolvedValue({ status: 302, location: 'http://127.0.0.1/private' });
  await expect(importCompanionImageResource('https://images.example/image.png')).rejects.toThrow('url_rejected');
  expect(native.readRemoteImageResponse).toHaveBeenCalledTimes(1);
  expect(native.writeImageAttachment).not.toHaveBeenCalled();
});

it('bounds redirect chains without writing partial image data', async () => {
  native.readRemoteImageResponse.mockResolvedValue({ status: 302, location: '/again.png' });
  await expect(importCompanionImageResource('https://images.example/image.png')).rejects.toThrow('redirect_limit');
  expect(native.readRemoteImageResponse).toHaveBeenCalledTimes(6);
  expect(native.writeImageAttachment).not.toHaveBeenCalled();
});

it('does not write a failed or non-image response', async () => {
  native.readRemoteImageResponse.mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({
    status: 200, bytesBase64: btoa('<html>not an image</html>')
  });
  await expect(importCompanionImageResource('https://images.example/image.png')).rejects.toThrow('download_failed');
  await expect(importCompanionImageResource('https://images.example/image.png')).rejects.toThrow('type_rejected');
  expect(native.writeImageAttachment).not.toHaveBeenCalled();
});

it('retains the native file reuse result', async () => {
  native.readRemoteImageResponse.mockResolvedValue({ status: 200, bytesBase64: png });
  native.writeImageAttachment.mockResolvedValue({ storedFile: 'reused' });
  expect((await importCompanionImageResource('https://images.example/image.png')).storedFile).toBe('reused');
});
