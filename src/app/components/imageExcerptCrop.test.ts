import { afterEach, expect, it, vi } from 'vitest';

import { renderImageExcerptCrop } from './imageExcerptCrop';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('exports a crop from an already CORS-enabled attachment image', async () => {
  const image = document.createElement('img');
  image.src = 'foliole-asset://attachment/source-image';
  Object.defineProperties(image, {
    complete: { value: true },
    naturalHeight: { value: 100 },
    naturalWidth: { value: 200 }
  });
  const canvas = document.createElement('canvas');
  const drawImage = vi.fn();
  vi.spyOn(canvas, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback({
    arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
  } as Blob));
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
    tagName === 'canvas' ? canvas : createElement(tagName, options));

  await expect(renderImageExcerptCrop(image, { height: 0.4, width: 0.3, x: 0.1, y: 0.2 }))
    .resolves.toEqual(new Uint8Array([4, 5, 6]));
  expect(drawImage).toHaveBeenCalledWith(image, 20, 20, 60, 40, 0, 0, 60, 40);
});
