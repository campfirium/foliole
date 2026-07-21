// @vitest-environment node

import { expect, it } from 'vitest';

import { NATIVE_ASSISTANT_IMAGE_LIMITS } from '../../lib/platform/nativeAssistantImageContract.js';

import { validateAssistantImageDrafts } from './assistantImageValidation.js';

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function imageDraft(overrides: Record<string, unknown> = {}) {
  return {
    contentBase64: pngBytes.toString('base64'),
    mimeType: 'image/png',
    originalName: '../screen.png',
    sizeBytes: pngBytes.byteLength,
    ...overrides
  };
}

it('normalizes a valid image and derives its content identity', () => {
  expect(validateAssistantImageDrafts([imageDraft()])).toEqual([
    expect.objectContaining({
      bytes: expect.any(Uint8Array),
      extension: '.png',
      id: expect.stringMatching(/^[a-f0-9]{64}$/u),
      mimeType: 'image/png',
      originalName: 'screen.png',
      sizeBytes: pngBytes.byteLength
    })
  ]);
});

it.each([
  ['bad base64', imageDraft({ contentBase64: 'not-base64' })],
  ['declared size mismatch', imageDraft({ sizeBytes: pngBytes.byteLength + 1 })],
  ['unsupported type', imageDraft({ mimeType: 'image/gif' })],
  ['forged signature', imageDraft({ contentBase64: Buffer.from('not png').toString('base64'), sizeBytes: 7 })]
])('rejects %s', (_label, draft) => {
  expect(() => validateAssistantImageDrafts([draft])).toThrow();
});

it('rejects image batches above the message limit', () => {
  const images = Array.from({ length: NATIVE_ASSISTANT_IMAGE_LIMITS.count + 1 }, () => imageDraft());
  expect(() => validateAssistantImageDrafts(images)).toThrow('invalid_assistant_images');
});
