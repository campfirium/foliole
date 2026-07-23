import {
  extractWordPressPublishTitle,
  readWordPressPostBinding,
  readWordPressPublishMarkdown,
  writeWordPressPostBinding,
  type WordPressPostBinding
} from '../../lib/core/wordpress/wordpressFrontmatter.js';
import { convertWordPressMarkdownToHtml } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';
import type { NativeWordPressPublishArgs } from '../../lib/platform/nativeWordPressPublishContract.js';

import { writeWordPressPost, type WordPressClientConfig } from './wordpressClient.js';
import {
  loadWordPressCatalogCache,
  recordWordPressPublishSelection,
  saveWordPressCatalogCache
} from './wordpressPublishCache.js';
import {
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadStoredWordPressPublishSettings,
  loadWordPressCredential,
  loadWordPressPublishSettings,
  saveWordPressPublishDraft
} from './wordpressPublishSettings.js';
import {
  loadWordPressPublishCatalog as loadCatalog,
  resolveCoreCategoryId,
  resolveCoreTagIds
} from './wordpressTaxonomyClient.js';

function requireConfiguredWordPress(): WordPressClientConfig {
  const settings = loadStoredWordPressPublishSettings();
  const credential = loadWordPressCredential(settings);
  if (!settings || !credential || !settings.endpoint) {
    throw new Error('WordPress publishing is not connected.');
  }
  return {
    adapter: settings.adapter,
    blogId: settings.blog_id,
    credential,
    endpoint: settings.endpoint,
    siteUrl: settings.site_url
  };
}

function validateBinding(binding: WordPressPostBinding | null, config: WordPressClientConfig) {
  if (!binding) return;
  if (binding.site !== config.siteUrl) {
    throw new Error('This Topic is bound to a different WordPress site.');
  }
  if (binding.adapter !== config.adapter) {
    throw new Error('This Topic is bound to a different WordPress connection type.');
  }
}

export {
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadWordPressPublishSettings,
  saveWordPressPublishDraft
};

export async function loadWordPressPublishCatalog(args: { post_id?: string; refresh?: boolean } = {}) {
  const config = requireConfiguredWordPress();
  const cached = loadWordPressCatalogCache(config, args.post_id);
  if (cached && !args.refresh) return cached;
  const catalog = {
    ...await loadCatalog(config, args.post_id),
    fetched_at: new Date().toISOString(),
    from_cache: false
  };
  saveWordPressCatalogCache(config, catalog, args.post_id);
  return catalog;
}

export async function publishTopicToWordPress(args: NativeWordPressPublishArgs) {
  const config = requireConfiguredWordPress();
  const existing = readWordPressPostBinding(args.content);
  validateBinding(existing, config);
  const coreCategoryId = config.adapter === 'core_rest' ? await resolveCoreCategoryId(config, args.category) : undefined;
  const coreTagIds = config.adapter === 'core_rest' ? await resolveCoreTagIds(config, args.tags) : undefined;
  const saved = await writeWordPressPost(config, {
    ...(coreCategoryId ? { categories: [coreCategoryId] } : {}),
    content: convertWordPressMarkdownToHtml(readWordPressPublishMarkdown(args.content)),
    status: args.status,
    ...(coreTagIds ? { tags: coreTagIds } : {}),
    ...(config.adapter === 'wordpress_com_xmlrpc' ? { termsNames: {
      category: args.category ? [args.category.name] : [],
      post_tag: args.tags.map((tag) => tag.name)
    } } : {}),
    title: extractWordPressPublishTitle(args.content, args.title)
  }, existing?.postId);
  recordWordPressPublishSelection({
    category: args.category ? { ...args.category, id: coreCategoryId ?? args.category.id } : null,
    config,
    postId: saved.postId,
    tags: args.tags.map((tag, index) => ({ ...tag, id: coreTagIds?.[index] ?? tag.id }))
  });
  const binding: WordPressPostBinding = {
    adapter: config.adapter,
    lastPublishedAt: new Date().toISOString(),
    postId: saved.postId,
    site: config.siteUrl,
    url: saved.url
  };
  return {
    mode: existing ? 'updated' as const : 'created' as const,
    post_id: saved.postId,
    updated_content: writeWordPressPostBinding(args.content, binding),
    url: saved.url
  };
}
