import { beforeEach, expect, it, vi } from 'vitest';

import { loadWordPressPublishCatalog, resolveCoreTagIds } from './wordpressTaxonomyClient.js';

const config = {
  adapter: 'core_rest' as const,
  blogId: null,
  credential: {
    adapter: 'core_rest' as const,
    applicationPassword: 'secret',
    siteUrl: 'https://blog.example.com',
    username: 'writer'
  },
  endpoint: 'https://blog.example.com/wp-json/wp/v2',
  siteUrl: 'https://blog.example.com'
};

beforeEach(() => vi.restoreAllMocks());

it('loads categories, tags, and the connected post selection through the REST adapter', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 7, name: 'Writing', parent: 0, slug: 'writing' }
    ]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 11, name: 'foliole', slug: 'foliole' },
      { id: 12, name: 'reading', slug: 'reading' }
    ]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ categories: [7], tags: [12] }), { status: 200 }));

  await expect(loadWordPressPublishCatalog(config, '123')).resolves.toEqual({
    categories: [{ id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' }],
    selected_category_id: 7,
    selected_tags: ['reading'],
    tags: [
      { id: 11, name: 'foliole', slug: 'foliole' },
      { id: 12, name: 'reading', slug: 'reading' }
    ]
  });
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    expect.stringContaining('/categories?'),
    expect.stringContaining('/tags?'),
    expect.stringContaining('/posts/123?')
  ]);
});

it('keeps existing tag ids and creates only newly entered tags', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 19, name: 'new-tag' }), { status: 201 })
  );

  await expect(resolveCoreTagIds(config, [
    { id: 11, name: 'foliole' },
    { id: null, name: 'new-tag' }
  ])).resolves.toEqual([11, 19]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![1]?.body).toBe(JSON.stringify({ name: 'new-tag' }));
});
