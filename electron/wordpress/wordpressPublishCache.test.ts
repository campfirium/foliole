import { beforeEach, expect, it, vi } from 'vitest';

import {
  loadWordPressCatalogCache,
  recordWordPressPublishSelection,
  saveWordPressCatalogCache
} from './wordpressPublishCache.js';
import type { StoredWordPressPublishSettings } from './wordpressPublishSettings.js';

const state = vi.hoisted(() => ({ settings: null as StoredWordPressPublishSettings | null }));

vi.mock('./wordpressPublishSettings.js', () => ({
  loadStoredWordPressPublishSettings: () => state.settings,
  saveStoredWordPressPublishSettings: (settings: StoredWordPressPublishSettings) => { state.settings = settings; }
}));

const config = { adapter: 'core_rest' as const, siteUrl: 'https://blog.example.com' };

beforeEach(() => {
  state.settings = {
    adapter: 'core_rest',
    blog_id: null,
    endpoint: 'https://blog.example.com/wp-json/wp/v2',
    site_url: config.siteUrl,
    updated_at: '2026-07-24T00:00:00.000Z'
  };
});

it('returns only the matching site catalog and post selection as cached data', () => {
  state.settings!.catalog_cache = {
    adapter: 'core_rest',
    categories: [{ id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' }],
    fetched_at: '2026-07-24T00:00:00.000Z',
    selections_by_post: { '123': { category_id: 7, tags: ['foliole'] } },
    site_url: config.siteUrl,
    tags: [{ id: 11, name: 'foliole', slug: 'foliole' }]
  };

  expect(loadWordPressCatalogCache(config, '123')).toMatchObject({
    from_cache: true,
    selected_category_id: 7,
    selected_tags: ['foliole']
  });
  expect(loadWordPressCatalogCache({ ...config, siteUrl: 'https://other.example.com' }, '123')).toBeNull();
});

it('refreshes taxonomy while retaining selections stored for other posts', () => {
  state.settings!.catalog_cache = {
    adapter: 'core_rest', categories: [], fetched_at: 'old',
    selections_by_post: { '123': { category_id: 7, tags: ['old'] } },
    site_url: config.siteUrl, tags: []
  };
  saveWordPressCatalogCache(config, {
    categories: [{ id: 8, name: 'Fresh', parent_category_id: null, slug: 'fresh' }],
    fetched_at: null,
    from_cache: false,
    selected_category_id: 8,
    selected_tags: ['fresh'],
    tags: [{ id: 18, name: 'fresh', slug: 'fresh' }]
  }, '456');

  expect(loadWordPressCatalogCache(config, '123')).toMatchObject({ selected_category_id: 7, selected_tags: ['old'] });
  expect(loadWordPressCatalogCache(config, '456')).toMatchObject({ selected_category_id: 8, selected_tags: ['fresh'] });
});

it('records the published selection and adds newly created terms to the local catalog', () => {
  state.settings!.catalog_cache = {
    adapter: 'core_rest', categories: [], fetched_at: 'old', site_url: config.siteUrl, tags: []
  };
  recordWordPressPublishSelection({
    category: { id: 23, name: 'Research' },
    config,
    postId: '789',
    tags: [{ id: 29, name: 'new-tag' }]
  });

  expect(loadWordPressCatalogCache(config, '789')).toMatchObject({
    categories: [expect.objectContaining({ id: 23, name: 'Research' })],
    selected_category_id: 23,
    selected_tags: ['new-tag'],
    tags: [expect.objectContaining({ id: 29, name: 'new-tag' })]
  });
});
