import { expect, it } from 'vitest';

import { createMarkdownImageElement } from './liveMarkdownImageElement';

it('loads stable attachment images with anonymous CORS before assigning the source', () => {
  const image = createMarkdownImageElement({
    alt: 'Excerpt source',
    display: 'block',
    source: 'foliole-asset://attachment/hash-1'
  });

  expect(image.crossOrigin).toBe('anonymous');
  expect(image.src).toBe('foliole-asset://attachment/hash-1');
});
