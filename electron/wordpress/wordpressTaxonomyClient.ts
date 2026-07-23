import type {
  NativeWordPressPublishCategorySelection,
  NativeWordPressPublishCatalog,
  NativeWordPressPublishTagSelection
} from '../../lib/platform/nativeWordPressPublishContract.js';

import {
  buildBasicAuthorization,
  callXmlRpc,
  fetchWordPress,
  readCoreJson,
  toRecord,
  type WordPressClientConfig
} from './wordpressClient.js';
import type { XmlRpcValue } from './xmlRpcCodec.js';

const TERM_LIMIT = 100;

function coreHeaders(config: WordPressClientConfig) {
  return { Authorization: buildBasicAuthorization(config.credential) };
}

function readCoreTerms(value: unknown, kind: 'category' | 'tag') {
  if (!Array.isArray(value)) throw new Error('WordPress returned an invalid taxonomy response.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('WordPress returned an invalid taxonomy term.');
    const term = entry as Record<string, unknown>;
    if (typeof term.id !== 'number' || typeof term.name !== 'string' || typeof term.slug !== 'string') {
      throw new Error('WordPress returned an invalid taxonomy term.');
    }
    return {
      id: term.id,
      name: term.name,
      ...(kind === 'category' ? { parent_category_id: typeof term.parent === 'number' && term.parent > 0 ? term.parent : null } : {}),
      slug: term.slug
    };
  });
}

async function loadCoreCollection(config: WordPressClientConfig, route: 'categories' | 'tags') {
  const url = `${config.endpoint}/${route}?per_page=${TERM_LIMIT}&hide_empty=false&orderby=name&order=asc`;
  const response = await fetchWordPress(url, { headers: coreHeaders(config), method: 'GET' }, 'The WordPress site is not responding.');
  return readCoreTerms(await readCoreJson(response, `WordPress could not load ${route}`), route === 'categories' ? 'category' : 'tag');
}

async function loadCoreSelection(config: WordPressClientConfig, postId?: string) {
  if (!postId) return { selected_category_id: null, selectedTagIds: [] as number[] };
  const response = await fetchWordPress(`${config.endpoint}/posts/${encodeURIComponent(postId)}?context=edit&_fields=categories,tags`, {
    headers: coreHeaders(config), method: 'GET'
  }, 'The WordPress site is not responding.');
  const post = await readCoreJson(response, 'WordPress could not load the connected post');
  const categories = Array.isArray(post.categories) ? post.categories.filter((id): id is number => typeof id === 'number') : [];
  const tags = Array.isArray(post.tags) ? post.tags.filter((id): id is number => typeof id === 'number') : [];
  return { selected_category_id: categories[0] ?? null, selectedTagIds: tags };
}

async function loadCoreCatalog(config: WordPressClientConfig, postId?: string): Promise<NativeWordPressPublishCatalog> {
  const [categories, tags, selection] = await Promise.all([
    loadCoreCollection(config, 'categories'), loadCoreCollection(config, 'tags'), loadCoreSelection(config, postId)
  ]);
  return {
    categories: categories as NativeWordPressPublishCatalog['categories'],
    selected_category_id: selection.selected_category_id,
    selected_tags: tags.filter((tag) => selection.selectedTagIds.includes(tag.id)).map((tag) => tag.name),
    tags: tags as NativeWordPressPublishCatalog['tags']
  };
}

function readXmlTerms(value: XmlRpcValue, taxonomy: 'category' | 'post_tag') {
  if (!Array.isArray(value)) throw new Error('WordPress.com returned an invalid taxonomy response.');
  return value.map((entry) => {
    const term = toRecord(entry);
    const id = Number(term?.term_id);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof term?.name !== 'string' || typeof term.slug !== 'string') {
      throw new Error('WordPress.com returned an invalid taxonomy term.');
    }
    return {
      id,
      name: term.name,
      ...(taxonomy === 'category' ? { parent_category_id: Number(term.parent) > 0 ? Number(term.parent) : null } : {}),
      slug: term.slug
    };
  });
}

async function loadXmlTerms(config: WordPressClientConfig, taxonomy: 'category' | 'post_tag') {
  const credential = config.credential;
  const value = await callXmlRpc(config.endpoint, 'wp.getTerms', [
    Number(config.blogId ?? 0), credential.username, credential.applicationPassword, taxonomy,
    { hide_empty: false, number: TERM_LIMIT, order: 'ASC', orderby: 'name' }
  ]);
  return readXmlTerms(value, taxonomy);
}

async function loadXmlSelection(config: WordPressClientConfig, postId?: string) {
  if (!postId) return { selected_category_id: null, selected_tags: [] as string[] };
  const credential = config.credential;
  const value = await callXmlRpc(config.endpoint, 'wp.getPost', [
    Number(config.blogId ?? 0), credential.username, credential.applicationPassword, Number(postId), ['terms']
  ]);
  const terms = toRecord(value)?.terms;
  const records = Array.isArray(terms) ? terms.map(toRecord).filter((term): term is Record<string, XmlRpcValue> => Boolean(term)) : [];
  const category = records.find((term) => term.taxonomy === 'category');
  return {
    selected_category_id: category ? Number(category.term_id) : null,
    selected_tags: records.filter((term) => term.taxonomy === 'post_tag' && typeof term.name === 'string').map((term) => String(term.name))
  };
}

async function loadXmlCatalog(config: WordPressClientConfig, postId?: string): Promise<NativeWordPressPublishCatalog> {
  const [categories, tags, selection] = await Promise.all([
    loadXmlTerms(config, 'category'), loadXmlTerms(config, 'post_tag'), loadXmlSelection(config, postId)
  ]);
  return {
    categories: categories as NativeWordPressPublishCatalog['categories'],
    selected_category_id: Number.isSafeInteger(selection.selected_category_id) ? selection.selected_category_id : null,
    selected_tags: selection.selected_tags,
    tags: tags as NativeWordPressPublishCatalog['tags']
  };
}

export function loadWordPressPublishCatalog(config: WordPressClientConfig, postId?: string) {
  return config.adapter === 'core_rest' ? loadCoreCatalog(config, postId) : loadXmlCatalog(config, postId);
}

async function createCoreTerm(config: WordPressClientConfig, route: 'categories' | 'tags', name: string) {
  const response = await fetchWordPress(`${config.endpoint}/${route}`, {
    body: JSON.stringify({ name }),
    headers: { ...coreHeaders(config), 'Content-Type': 'application/json' },
    method: 'POST'
  }, 'The WordPress site is not responding.');
  const payload = await response.json() as Record<string, unknown>;
  const existingId = payload.data && typeof payload.data === 'object'
    ? Number((payload.data as Record<string, unknown>).term_id)
    : null;
  const id = response.ok ? Number(payload.id) : existingId;
  const termLabel = route === 'categories' ? 'category' : 'tag';
  if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error(`WordPress could not create the ${termLabel} “${name}”.`);
  return Number(id);
}

export async function resolveCoreCategoryId(
  config: WordPressClientConfig,
  category: NativeWordPressPublishCategorySelection | null
) {
  if (!category) return undefined;
  return category.id ?? createCoreTerm(config, 'categories', category.name);
}

export async function resolveCoreTagIds(config: WordPressClientConfig, tags: NativeWordPressPublishTagSelection[]) {
  return Promise.all(tags.map((tag) => tag.id ?? createCoreTerm(config, 'tags', tag.name)));
}
