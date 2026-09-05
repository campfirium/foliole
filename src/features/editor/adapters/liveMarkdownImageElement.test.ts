import { afterEach, expect, it, vi } from 'vitest';

import { createMarkdownImageElement } from './liveMarkdownImageElement';

afterEach(() => {
  vi.useRealTimers();
});

it('loads stable attachment images with anonymous CORS before assigning the source', () => {
  const image = createMarkdownImageElement({
    alt: 'Excerpt source',
    display: 'block',
    source: 'foliole-asset://attachment/hash-1'
  });

  expect(image.crossOrigin).toBe('anonymous');
  expect(image.src).toBe('foliole-asset://attachment/hash-1');
});

it('retries a transient local attachment failure before reporting it unavailable', () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const image = createMarkdownImageElement({
    alt: 'Excerpt source',
    display: 'block',
    onError,
    source: 'foliole-asset://attachment/hash-1'
  });

  image.dispatchEvent(new Event('error'));
  expect(onError).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  expect(new URL(image.src).searchParams.get('retry')).toBe('1');

  image.dispatchEvent(new Event('error'));
  expect(onError).toHaveBeenCalledOnce();
});
