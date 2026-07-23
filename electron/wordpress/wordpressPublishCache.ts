import type {
  NativeWordPressPublishCatalog,
  NativeWordPressPublishCategorySelection,
  NativeWordPressPublishTagSelection
} from '../../lib/platform/nativeWordPressPublishContract.js';

import type { WordPressClientConfig } from './wordpressClient.js';
import {
  loadStoredWordPressPublishSettings,
  saveStoredWordPressPublishSettings
} from './wordpressPublishSettings.js';

type CacheConfig = Pick<WordPressClientConfig, 'adapter' | 'siteUrl'>;

function loadMatchingCache(config: CacheConfig) {
  const settings = loadStoredWordPressPublishSettings();
  const cache = settings?.catalog_cache;
  return settings && cache?.site_url === config.siteUrl && cache.adapter === config.adapter
    ? { cache, settings }
    : null;
}

export function loadWordPressCatalogCache(config: CacheConfig, postId?: string): NativeWordPressPublishCatalog | null {
  const matched = loadMatchingCache(config);
  if (!matched) return null;
  const selection = postId ? matched.cache.selections_by_post?.[postId] : undefined;
  return {
    categories: matched.cache.categories,
    fetched_at: matched.cache.fetched_at,
    from_cache: true,
    selected_category_id: selection?.category_id ?? null,
    selected_tags: selection?.tags ?? [],
    tags: matched.cache.tags
  };
}

export function saveWordPressCatalogCache(
  config: CacheConfig,
  catalog: NativeWordPressPublishCatalog,
  postId?: string
) {
  const settings = loadStoredWordPressPublishSettings();
  if (!settings || settings.site_url !== config.siteUrl || settings.adapter !== config.adapter) return;
  const previous = loadMatchingCache(config)?.cache;
  const selections = { ...previous?.selections_by_post };
  if (postId) selections[postId] = {
    category_id: catalog.selected_category_id,
    tags: [...catalog.selected_tags]
  };
  const now = new Date().toISOString();
  saveStoredWordPressPublishSettings({
    ...settings,
    catalog_cache: {
      adapter: config.adapter,
      categories: catalog.categories,
      fetched_at: now,
      ...(Object.keys(selections).length > 0 ? { selections_by_post: selections } : {}),
      site_url: config.siteUrl,
      tags: catalog.tags
    },
    updated_at: now
  });
}

export function recordWordPressPublishSelection(args: {
  category: NativeWordPressPublishCategorySelection | null;
  config: CacheConfig;
  postId: string;
  tags: NativeWordPressPublishTagSelection[];
}) {
  const matched = loadMatchingCache(args.config);
  if (!matched) return;
  const now = new Date().toISOString();
  const category = args.category?.id && !matched.cache.categories.some((entry) => entry.id === args.category?.id)
    ? [{ id: args.category.id, name: args.category.name, parent_category_id: null, slug: '' }, ...matched.cache.categories]
    : matched.cache.categories;
  const knownTagIds = new Set(matched.cache.tags.map((tag) => tag.id));
  const tags = [
    ...args.tags.filter((tag) => tag.id && !knownTagIds.has(tag.id)).map((tag) => ({
      id: tag.id as number,
      name: tag.name,
      slug: ''
    })),
    ...matched.cache.tags
  ];
  saveStoredWordPressPublishSettings({
    ...matched.settings,
    catalog_cache: {
      ...matched.cache,
      categories: category,
      fetched_at: now,
      selections_by_post: {
        ...matched.cache.selections_by_post,
        [args.postId]: {
          category_id: args.category?.id ?? null,
          tags: args.tags.map((tag) => tag.name)
        }
      },
      tags
    },
    updated_at: now
  });
}
