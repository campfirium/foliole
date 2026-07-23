import {
  readDiscoursePublishMarkdown,
  readDiscourseTopicBinding,
  writeDiscourseTopicBinding,
  type DiscourseTopicBinding
} from '../../lib/core/discourse/discourseFrontmatter.js';
import { extractDiscoursePublishTitle } from '../../lib/core/discourse/discoursePublishTitle.js';
import type { NativeDiscoursePublishArgs } from '../../lib/platform/nativeDiscoursePublishContract.js';

import { createDiscourseTopic, loadDiscoursePublishCatalog as loadCatalog, updateDiscourseTopic } from './discourseClient.js';
import {
  loadDiscourseCatalogCache,
  loadDiscourseApiKey,
  loadDiscoursePublishDraft,
  loadDiscoursePublishSettings,
  disconnectDiscoursePublishSettings,
  recordDiscoursePublishUsage,
  saveDiscourseCatalogCache,
  saveDiscoursePublishDraft,
  saveDiscoursePublishSettings
} from './discoursePublishSettings.js';
import {
  beginDiscourseUserApiAuthorization as beginAuthorization,
  completeDiscourseUserApiAuthorization as completeAuthorization
} from './discourseUserApiAuthorization.js';

type DiscourseClientConfig = { apiKey: string; siteUrl: string };

function requireConfiguredSettings() {
  const settings = loadDiscoursePublishSettings();
  const apiKey = loadDiscourseApiKey();
  if (!settings.site_url || !apiKey) {
    throw new Error('Discourse publishing is not configured.');
  }
  return { apiKey, settings };
}

function validateBindingSite(binding: DiscourseTopicBinding | null, siteUrl: string) {
  if (binding && binding.site !== siteUrl) {
    throw new Error('This Topic is bound to a different Discourse site.');
  }
}

function buildBinding(args: {
  categoryId: number | null;
  existing: DiscourseTopicBinding | null;
  postId: number;
  siteUrl: string;
  tags: string[];
  topicId: number;
  url: string;
}): DiscourseTopicBinding {
  return {
    categoryId: args.categoryId,
    lastPublishedAt: new Date().toISOString(),
    postId: args.postId,
    site: args.siteUrl,
    tags: args.tags,
    topicId: args.topicId,
    url: args.url || args.existing?.url || `${args.siteUrl}/t/topic/${args.topicId}`
  };
}

export {
  disconnectDiscoursePublishSettings,
  loadDiscoursePublishDraft,
  loadDiscoursePublishSettings,
  saveDiscoursePublishDraft,
  saveDiscoursePublishSettings
};

export async function beginDiscourseUserApiAuthorization(args: { site_url: string }) {
  return beginAuthorization(args.site_url);
}

export function completeDiscourseUserApiAuthorization(args: { payload: string; site_url: string }) {
  const apiKey = completeAuthorization(args.site_url, args.payload);
  return saveDiscoursePublishSettings({ api_key: apiKey, site_url: args.site_url });
}

export async function loadDiscoursePublishCatalog(args?: { refresh?: boolean }) {
  const { apiKey, settings } = requireConfiguredSettings();
  const cached = loadDiscourseCatalogCache(settings.site_url);
  if (cached && !args?.refresh) return cached;
  const catalog = await loadCatalog({ apiKey, siteUrl: settings.site_url });
  saveDiscourseCatalogCache(settings.site_url, catalog);
  return {
    ...catalog,
    fetched_at: new Date().toISOString(),
    from_cache: false,
    last_published_tags: cached?.last_published_tags ?? [],
    recent_category_ids: cached?.recent_category_ids ?? [],
    recent_tags: cached?.recent_tags ?? []
  };
}

async function publishExistingTopic(args: {
  categoryId: number | null;
  client: DiscourseClientConfig;
  content: string;
  existing: DiscourseTopicBinding;
  raw: string;
  tags: string[];
  title: string;
}) {
  await updateDiscourseTopic(args.client, {
    categoryId: args.categoryId,
    postId: args.existing.postId,
    raw: args.raw,
    tags: args.tags,
    title: args.title,
    topicId: args.existing.topicId
  });
  const updated = buildBinding({
    categoryId: args.categoryId,
    existing: args.existing,
    postId: args.existing.postId,
    siteUrl: args.client.siteUrl,
    tags: args.tags,
    topicId: args.existing.topicId,
    url: args.existing.url
  });
  return {
    mode: 'updated' as const,
    post_id: updated.postId,
    topic_id: updated.topicId,
    updated_content: writeDiscourseTopicBinding(args.content, updated),
    url: updated.url
  };
}

async function publishNewTopic(args: {
  categoryId: number | null;
  client: DiscourseClientConfig;
  content: string;
  raw: string;
  tags: string[];
  title: string;
}) {
  const created = await createDiscourseTopic(args.client, {
    categoryId: args.categoryId,
    raw: args.raw,
    tags: args.tags,
    title: args.title
  });
  const binding = buildBinding({
    categoryId: args.categoryId,
    existing: null,
    postId: created.postId,
    siteUrl: args.client.siteUrl,
    tags: args.tags,
    topicId: created.topicId,
    url: created.url
  });
  return {
    mode: 'created' as const,
    post_id: binding.postId,
    topic_id: binding.topicId,
    updated_content: writeDiscourseTopicBinding(args.content, binding),
    url: binding.url
  };
}

export async function publishTopicToDiscourse(args: NativeDiscoursePublishArgs) {
  const { apiKey, settings } = requireConfiguredSettings();
  const existing = readDiscourseTopicBinding(args.content);
  validateBindingSite(existing, settings.site_url);
  const publishArgs = {
    categoryId: args.category_id,
    client: { apiKey, siteUrl: settings.site_url },
    content: args.content,
    raw: readDiscoursePublishMarkdown(args.content),
    tags: args.tags,
    title: extractDiscoursePublishTitle(args.content, args.title)
  };
  const result = existing ? await publishExistingTopic({ ...publishArgs, existing }) : await publishNewTopic(publishArgs);
  recordDiscoursePublishUsage(settings.site_url, {
    categoryId: args.category_id,
    tags: args.tags
  });
  return result;
}
