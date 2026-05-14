import { describe, expect, it } from 'vitest';

import { createBoundedCache } from './boundedCache';

describe('createBoundedCache', () => {
  it('evicts the oldest entry when the limit is exceeded', () => {
    const cache = createBoundedCache<string, number>(2);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('promotes cache hits before the next eviction', () => {
    const cache = createBoundedCache<string, number>(2);

    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('updates existing entries without growing past the limit', () => {
    const cache = createBoundedCache<string, number>(2);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
  });

  it('supports no-op deletes and clear', () => {
    const cache = createBoundedCache<string, number>(2);

    expect(cache.delete('missing')).toBe(false);
    cache.set('a', 1);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
