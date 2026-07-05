import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('formats Discourse validation errors without exposing raw JSON', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    action: 'create_post',
    errors: ['正文 过短（最少 20 个字符）']
  }), {
    status: 422,
    statusText: 'Unprocessable Entity'
  }));
  vi.stubGlobal('fetch', fetchMock);

  const { createDiscourseTopic } = await import('./discourseClient.js');
  const publish = createDiscourseTopic({
    apiKey: 'user-key',
    siteUrl: 'https://forum.example.com'
  }, {
    categoryId: null,
    raw: 'short',
    tags: [],
    title: 'Short'
  });
  await expect(publish).rejects.toThrow('Discourse request failed (422): 正文 过短（最少 20 个字符）');
  await expect(publish).rejects.not.toThrow('create_post');
});

it('uses a user-facing message when the forum does not respond during publishing', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  vi.stubGlobal('fetch', fetchMock);

  const { createDiscourseTopic } = await import('./discourseClient.js');
  const publish = createDiscourseTopic({
    apiKey: 'user-key',
    siteUrl: 'https://forum.example.com'
  }, {
    categoryId: 7,
    raw: 'Long enough body for Discourse publishing.',
    tags: ['new-tag'],
    title: 'Publish topic'
  });
  await expect(publish).rejects.toThrow("The forum isn't responding right now. Try Publish again in a moment.");
  await expect(publish).rejects.not.toThrow('fetch failed');
});

it('loads Discourse categories and tags for publish choices', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      category_list: {
        categories: [
          {
            id: 7,
            name: 'Tools',
            parent_category_id: null,
            slug: 'tools',
            subcategory_list: [
              {
                id: 8,
                name: 'Toys',
                slug: 'toys',
                subcategory_list: [{ id: 9, name: 'Blocks', slug: 'blocks' }]
              }
            ]
          }
        ]
      }
    })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      tags: [{ id: 'foliole', name: 'foliole' }, { text: 'desktop' }]
    })));
  vi.stubGlobal('fetch', fetchMock);

  const { loadDiscoursePublishCatalog } = await import('./discourseClient.js');
  await expect(loadDiscoursePublishCatalog({
    apiKey: 'user-key',
    siteUrl: 'https://forum.example.com'
  })).resolves.toEqual({
    categories: [
      { id: 7, name: 'Tools', parent_category_id: null, slug: 'tools' },
      { id: 8, name: 'Tools / Toys', parent_category_id: 7, slug: 'toys' },
      { id: 9, name: 'Tools / Toys / Blocks', parent_category_id: 8, slug: 'blocks' }
    ],
    tags: [{ id: 'foliole', name: 'foliole' }, { id: 'desktop', name: 'desktop' }]
  });
  expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://forum.example.com/categories.json?include_subcategories=true', expect.objectContaining({
    headers: expect.objectContaining({ 'User-Api-Key': 'user-key' })
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://forum.example.com/tags.json', expect.anything());
});
