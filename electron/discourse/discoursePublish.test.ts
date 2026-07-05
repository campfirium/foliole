import { beforeEach, expect, it, vi } from 'vitest';

import { readDiscourseTopicBinding, writeDiscourseTopicBinding } from '../../lib/core/discourse/discourseFrontmatter.js';

const createDiscourseTopic = vi.fn();
const loadDiscoursePublishCatalog = vi.fn();
const loadDiscourseCatalogCache = vi.fn();
const recordDiscoursePublishUsage = vi.fn();
const saveDiscourseCatalogCache = vi.fn();
const updateDiscourseTopic = vi.fn();

vi.mock('./discourseClient.js', () => ({
  createDiscourseTopic,
  loadDiscoursePublishCatalog,
  updateDiscourseTopic
}));

vi.mock('./discoursePublishSettings.js', () => ({
  loadDiscourseCatalogCache,
  loadDiscourseApiKey: () => 'secret-api-key',
  loadDiscoursePublishSettings: () => ({
    has_api_key: true,
    site_url: 'https://forum.example.com',
    updated_at: '2026-07-02T00:00:00.000Z'
  }),
  recordDiscoursePublishUsage,
  saveDiscourseCatalogCache,
  saveDiscoursePublishSettings: vi.fn()
}));

beforeEach(() => {
  createDiscourseTopic.mockReset();
  loadDiscourseCatalogCache.mockReset();
  loadDiscoursePublishCatalog.mockReset();
  recordDiscoursePublishUsage.mockReset();
  saveDiscourseCatalogCache.mockReset();
  updateDiscourseTopic.mockReset();
});

it('creates a Discourse topic and returns updated markdown binding without leaking the API key', async () => {
  createDiscourseTopic.mockResolvedValue({
    postId: 456,
    topicId: 123,
    url: 'https://forum.example.com/t/example/123'
  });
  const { publishTopicToDiscourse } = await import('./discoursePublish.js');
  const result = await publishTopicToDiscourse({
    category_id: 7,
    content: '---\nauthor: Ada\n---\n# Title\n\nBody',
    tags: ['release'],
    title: 'Title'
  });
  expect(createDiscourseTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    categoryId: 7,
    raw: 'Body',
    tags: ['release']
  }));
  expect(readDiscourseTopicBinding(result.updated_content)).toMatchObject({ postId: 456, topicId: 123 });
  expect(recordDiscoursePublishUsage).toHaveBeenCalledWith('https://forum.example.com', {
    categoryId: 7,
    tags: ['release']
  });
  expect(JSON.stringify(result)).not.toContain('secret-api-key');
});

it('uses the first body H1 as the Discourse title before the Topic title fallback', async () => {
  createDiscourseTopic.mockResolvedValue({
    postId: 456,
    topicId: 123,
    url: 'https://forum.example.com/t/example/123'
  });
  const { publishTopicToDiscourse } = await import('./discoursePublish.js');
  await publishTopicToDiscourse({
    category_id: 7,
    content: '# Body Title\n\nLong enough body for Discourse.',
    tags: [],
    title: 'Folder Title'
  });
  expect(createDiscourseTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    raw: 'Long enough body for Discourse.',
    title: 'Body Title'
  }));
});

it('updates an existing Discourse topic from the frontmatter binding', async () => {
  const content = writeDiscourseTopicBinding('# Updated', {
    categoryId: 7,
    lastPublishedAt: '2026-07-02T00:00:00.000Z',
    postId: 456,
    site: 'https://forum.example.com',
    tags: ['foliole'],
    topicId: 123,
    url: 'https://forum.example.com/t/example/123'
  });
  const { publishTopicToDiscourse } = await import('./discoursePublish.js');
  const result = await publishTopicToDiscourse({ category_id: 8, content, tags: ['note'], title: 'Updated' });
  expect(updateDiscourseTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    categoryId: 8,
    postId: 456,
    raw: '',
    topicId: 123
  }));
  expect(result.mode).toBe('updated');
});

it('uses cached Discourse publish catalog before refreshing the forum', async () => {
  loadDiscourseCatalogCache.mockReturnValue({
    categories: [{ id: 7, name: 'Release Notes', parent_category_id: null, slug: 'release-notes' }],
    fetched_at: '2026-07-02T00:00:00.000Z',
    from_cache: true,
    recent_category_ids: [7],
    recent_tags: ['foliole'],
    tags: [{ id: 'foliole', name: 'foliole' }]
  });
  const { loadDiscoursePublishCatalog: loadCatalog } = await import('./discoursePublish.js');
  await expect(loadCatalog()).resolves.toMatchObject({ from_cache: true, recent_tags: ['foliole'] });
  expect(loadDiscoursePublishCatalog).not.toHaveBeenCalled();
});

it('refreshes and stores the Discourse publish catalog on demand', async () => {
  loadDiscourseCatalogCache.mockReturnValue(null);
  loadDiscoursePublishCatalog.mockResolvedValue({
    categories: [{ id: 8, name: 'Guides', parent_category_id: null, slug: 'guides' }],
    tags: [{ id: 'desktop', name: 'desktop' }]
  });
  const { loadDiscoursePublishCatalog: loadCatalog } = await import('./discoursePublish.js');
  const result = await loadCatalog({ refresh: true });
  expect(result).toMatchObject({ from_cache: false, recent_tags: [] });
  expect(saveDiscourseCatalogCache).toHaveBeenCalledWith('https://forum.example.com', {
    categories: [{ id: 8, name: 'Guides', parent_category_id: null, slug: 'guides' }],
    tags: [{ id: 'desktop', name: 'desktop' }]
  });
});
