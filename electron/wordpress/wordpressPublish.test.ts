import { beforeEach, expect, it, vi } from 'vitest';

import { readWordPressPostBinding, writeWordPressPostBinding } from '../../lib/core/wordpress/wordpressFrontmatter.js';

const writeWordPressPost = vi.hoisted(() => vi.fn());
const taxonomyMocks = vi.hoisted(() => ({
  loadWordPressPublishCatalog: vi.fn(),
  resolveCoreCategoryId: vi.fn(),
  resolveCoreTagIds: vi.fn()
}));
const cacheMocks = vi.hoisted(() => ({
  loadWordPressCatalogCache: vi.fn(),
  recordWordPressPublishSelection: vi.fn(),
  saveWordPressCatalogCache: vi.fn()
}));
const settings = {
  adapter: 'core_rest' as const,
  blog_id: null,
  endpoint: 'https://blog.example.com/wp-json/wp/v2',
  site_url: 'https://blog.example.com',
  updated_at: '2026-07-16T00:00:00.000Z'
};
const credential = {
  adapter: 'core_rest' as const,
  applicationPassword: 'SENTINEL-WORDPRESS-SECRET',
  siteUrl: settings.site_url,
  username: 'writer'
};

vi.mock('./wordpressClient.js', () => ({ writeWordPressPost }));
vi.mock('./wordpressPublishCache.js', () => cacheMocks);
vi.mock('./wordpressTaxonomyClient.js', () => taxonomyMocks);
vi.mock('./wordpressPublishSettings.js', () => ({
  connectWordPressPublishSettings: vi.fn(),
  disconnectWordPressPublishSettings: vi.fn(),
  loadStoredWordPressPublishSettings: () => settings,
  loadWordPressCredential: () => credential,
  loadWordPressPublishSettings: vi.fn()
}));

beforeEach(() => {
  writeWordPressPost.mockReset();
  cacheMocks.loadWordPressCatalogCache.mockReset();
  cacheMocks.recordWordPressPublishSelection.mockReset();
  cacheMocks.saveWordPressCatalogCache.mockReset();
  taxonomyMocks.loadWordPressPublishCatalog.mockReset();
  taxonomyMocks.resolveCoreTagIds.mockReset();
  taxonomyMocks.resolveCoreCategoryId.mockReset();
  taxonomyMocks.resolveCoreCategoryId.mockImplementation(async (_config, category) => category?.id ?? 23);
  taxonomyMocks.resolveCoreTagIds.mockResolvedValue([11]);
  writeWordPressPost.mockResolvedValue({ postId: '123', url: 'https://blog.example.com/post' });
  cacheMocks.loadWordPressCatalogCache.mockReturnValue(null);
  taxonomyMocks.loadWordPressPublishCatalog.mockResolvedValue({
    categories: [], fetched_at: null, from_cache: false,
    selected_category_id: null, selected_tags: [], tags: []
  });
});

it('returns the local WordPress catalog without contacting the site', async () => {
  cacheMocks.loadWordPressCatalogCache.mockReturnValue({
    categories: [], fetched_at: '2026-07-24T00:00:00.000Z', from_cache: true,
    selected_category_id: 7, selected_tags: ['cached'], tags: []
  });
  const { loadWordPressPublishCatalog } = await import('./wordpressPublish.js');

  await expect(loadWordPressPublishCatalog({ post_id: '123' })).resolves.toMatchObject({ from_cache: true });
  expect(taxonomyMocks.loadWordPressPublishCatalog).not.toHaveBeenCalled();
});

it('refreshes and stores the WordPress catalog when requested', async () => {
  const { loadWordPressPublishCatalog } = await import('./wordpressPublish.js');
  const catalog = await loadWordPressPublishCatalog({ post_id: '123', refresh: true });

  expect(taxonomyMocks.loadWordPressPublishCatalog).toHaveBeenCalledWith(expect.anything(), '123');
  expect(catalog).toMatchObject({ from_cache: false, fetched_at: expect.any(String) });
  expect(cacheMocks.saveWordPressCatalogCache).toHaveBeenCalledWith(expect.anything(), catalog, '123');
});

it('creates a REST category before assigning it to the post', async () => {
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  await publishTopicToWordPress({
    category: { id: null, name: 'Research' }, content: '# Title\n\nBody',
    status: 'draft', tags: [], title: 'Title'
  });

  expect(taxonomyMocks.resolveCoreCategoryId).toHaveBeenCalledWith(expect.anything(), { id: null, name: 'Research' });
  expect(writeWordPressPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ categories: [23] }), undefined);
});

it('creates a WordPress post and writes the provider-specific binding after success', async () => {
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  const result = await publishTopicToWordPress({
    category: { id: 7, name: 'Writing' }, content: '# Body Title\n\nHello **WordPress**.',
    status: 'draft', tags: [{ id: 11, name: 'foliole' }], title: 'Topic title'
  });

  expect(writeWordPressPost).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: settings.site_url }), {
    categories: [7], content: '<p>Hello <strong>WordPress</strong>.</p>', status: 'draft',
    tags: [11], title: 'Body Title'
  }, undefined);
  expect(result.mode).toBe('created');
  expect(cacheMocks.recordWordPressPublishSelection).toHaveBeenCalledWith(expect.objectContaining({
    category: { id: 7, name: 'Writing' }, postId: '123', tags: [{ id: 11, name: 'foliole' }]
  }));
  expect(readWordPressPostBinding(result.updated_content)).toMatchObject({ postId: '123', site: settings.site_url });
  expect(JSON.stringify(result)).not.toContain('SENTINEL-WORDPRESS-SECRET');
});

it('updates the same remote post id from the WordPress binding', async () => {
  const content = writeWordPressPostBinding('# Updated\n\nBody', {
    adapter: 'core_rest', lastPublishedAt: '2026-07-16T00:00:00.000Z', postId: '123',
    site: settings.site_url, url: 'https://blog.example.com/post'
  });
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  const result = await publishTopicToWordPress({ category: null, content, status: 'publish', tags: [], title: 'Fallback' });

  expect(writeWordPressPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Updated' }), '123');
  expect(result.mode).toBe('updated');
  expect(result.post_id).toBe('123');
});

it('does not produce an updated binding when the remote write fails', async () => {
  writeWordPressPost.mockRejectedValue(new Error('remote rejected'));
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  await expect(publishTopicToWordPress({ category: null, content: '# Title\n\nBody', status: 'draft', tags: [], title: 'Title' }))
    .rejects.toThrow('remote rejected');
});

it('rejects a binding owned by another site before sending content', async () => {
  const content = writeWordPressPostBinding('# Title\n\nBody', {
    adapter: 'core_rest', lastPublishedAt: '2026-07-16T00:00:00.000Z', postId: '456',
    site: 'https://other.example.com', url: 'https://other.example.com/post'
  });
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  await expect(publishTopicToWordPress({ category: null, content, status: 'draft', tags: [], title: 'Title' }))
    .rejects.toThrow('different WordPress site');
  expect(writeWordPressPost).not.toHaveBeenCalled();
});
