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
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadStoredWordPressPublishSettings,
  loadWordPressCredential,
  loadWordPressPublishSettings,
  saveWordPressPublishDraft
} from './wordpressPublishSettings.js';

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

export async function publishTopicToWordPress(args: NativeWordPressPublishArgs) {
  const config = requireConfiguredWordPress();
  const existing = readWordPressPostBinding(args.content);
  validateBinding(existing, config);
  const saved = await writeWordPressPost(config, {
    content: convertWordPressMarkdownToHtml(readWordPressPublishMarkdown(args.content)),
    status: args.status,
    title: extractWordPressPublishTitle(args.content, args.title)
  }, existing?.postId);
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
