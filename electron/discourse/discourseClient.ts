interface DiscourseClientOptions {
  apiKey: string;
  siteUrl: string;
}

export interface DiscourseCreateTopicInput {
  categoryId: number | null;
  raw: string;
  tags: string[];
  title: string;
}

export interface DiscourseUpdateTopicInput {
  categoryId: number | null;
  postId: number;
  raw: string;
  tags: string[];
  title: string;
  topicId: number;
}

interface DiscoursePostResponse {
  id?: number;
  topic_id?: number;
  topic_slug?: string;
}

interface RawDiscourseCategory {
  id?: unknown;
  name?: unknown;
  parent_category_id?: unknown;
  slug?: unknown;
  subcategory_list?: unknown;
}

interface DiscourseCategoryResponse {
  category_list?: {
    categories?: RawDiscourseCategory[];
  };
}

interface DiscourseTagResponse {
  tags?: Array<{
    id?: unknown;
    name?: unknown;
    text?: unknown;
  }>;
}

function readDiscourseErrorMessage(text: string) {
  try {
    const payload = JSON.parse(text) as { error?: unknown; errors?: unknown; message?: unknown };
    if (Array.isArray(payload.errors)) {
      const errors = payload.errors.filter((entry): entry is string => typeof entry === 'string');
      if (errors.length > 0) return errors.join('\n');
    }
    if (typeof payload.error === 'string') return payload.error;
    if (typeof payload.message === 'string') return payload.message;
  } catch {
    // Fall back to the response body below when Discourse returns non-JSON text.
  }
  return text.trim();
}

function buildHeaders(options: DiscourseClientOptions) {
  return {
    'User-Api-Key': options.apiKey,
    'Content-Type': 'application/json'
  };
}

function buildUrl(siteUrl: string, path: string) {
  return `${siteUrl.replace(/\/+$/g, '')}${path}`;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    const message = readDiscourseErrorMessage(text).slice(0, 240) || response.statusText;
    throw new Error(`Discourse request failed (${response.status}): ${message}`);
  }
  return text ? JSON.parse(text) as DiscoursePostResponse : {};
}

async function readJsonPayload<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    const message = readDiscourseErrorMessage(text).slice(0, 240) || response.statusText;
    throw new Error(`Discourse request failed (${response.status}): ${message}`);
  }
  return text ? JSON.parse(text) as T : {} as T;
}

function toCategoryName(
  category: RawDiscourseCategory,
  categoryById: Map<number, RawDiscourseCategory>,
  seen = new Set<number>()
): string {
  const name = typeof category.name === 'string' ? category.name : '';
  if (typeof category.parent_category_id !== 'number' || seen.has(category.parent_category_id)) return name;
  const parent = categoryById.get(category.parent_category_id);
  const parentName = parent
    ? toCategoryName(parent, categoryById, new Set([...seen, category.parent_category_id]))
    : '';
  return parentName ? `${parentName} / ${name}` : name;
}

function flattenCategories(categories: RawDiscourseCategory[], parentId: number | null = null): RawDiscourseCategory[] {
  return categories.flatMap((category) => {
    const categoryId = typeof category.id === 'number' ? category.id : parentId;
    const current = parentId === null || typeof category.parent_category_id === 'number'
      ? category
      : { ...category, parent_category_id: parentId };
    const subcategories = Array.isArray(category.subcategory_list)
      ? flattenCategories(category.subcategory_list as RawDiscourseCategory[], categoryId)
      : [];
    return [current, ...subcategories];
  });
}

export async function loadDiscoursePublishCatalog(options: DiscourseClientOptions) {
  const [categoryPayload, tagPayload] = await Promise.all([
    readJsonPayload<DiscourseCategoryResponse>(await fetch(buildUrl(options.siteUrl, '/categories.json?include_subcategories=true'), {
      headers: buildHeaders(options),
      method: 'GET'
    })),
    readJsonPayload<DiscourseTagResponse>(await fetch(buildUrl(options.siteUrl, '/tags.json'), {
      headers: buildHeaders(options),
      method: 'GET'
    }))
  ]);
  const rawCategories = flattenCategories(categoryPayload.category_list?.categories ?? []);
  const categoryById = new Map(rawCategories
    .filter((category) => typeof category.id === 'number')
    .map((category) => [category.id as number, category]));
  return {
    categories: rawCategories
      .filter((category) => typeof category.id === 'number' && typeof category.name === 'string')
      .map((category) => ({
        id: category.id as number,
        name: toCategoryName(category, categoryById),
        parent_category_id: typeof category.parent_category_id === 'number' ? category.parent_category_id : null,
        slug: typeof category.slug === 'string' ? category.slug : ''
      })),
    tags: (tagPayload.tags ?? [])
      .map((tag) => typeof tag.name === 'string' ? tag.name : typeof tag.text === 'string' ? tag.text : null)
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ id: name, name }))
  };
}

export async function createDiscourseTopic(options: DiscourseClientOptions, input: DiscourseCreateTopicInput) {
  const response = await fetch(buildUrl(options.siteUrl, '/posts.json'), {
    body: JSON.stringify({
      category: input.categoryId ?? undefined,
      raw: input.raw,
      tags: input.tags,
      title: input.title
    }),
    headers: buildHeaders(options),
    method: 'POST'
  });
  const json = await readJsonResponse(response);
  if (!json.topic_id || !json.id) {
    throw new Error('Discourse create response did not include topic and post ids.');
  }
  return {
    postId: json.id,
    topicId: json.topic_id,
    url: `${options.siteUrl.replace(/\/+$/g, '')}/t/${json.topic_slug ?? 'topic'}/${json.topic_id}`
  };
}

export async function updateDiscourseTopic(options: DiscourseClientOptions, input: DiscourseUpdateTopicInput) {
  await readJsonResponse(await fetch(buildUrl(options.siteUrl, `/posts/${input.postId}.json`), {
    body: JSON.stringify({ raw: input.raw }),
    headers: buildHeaders(options),
    method: 'PUT'
  }));
  await readJsonResponse(await fetch(buildUrl(options.siteUrl, `/t/${input.topicId}.json`), {
    body: JSON.stringify({
      category_id: input.categoryId ?? undefined,
      tags: input.tags,
      title: input.title
    }),
    headers: buildHeaders(options),
    method: 'PUT'
  }));
}
