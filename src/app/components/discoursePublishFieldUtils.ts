import { toTags, type PublishFormState } from './discoursePublishDialogModel';

export type Category = { id: number; name: string; parent_category_id: number | null; slug: string };
export type Tag = { id: string; name: string };

export type PublishTaxonomyCatalog = {
  categories: Category[];
  last_published_tags?: string[];
  recent_category_ids?: number[];
  recent_tags?: string[];
  tags: Tag[];
};

export function byRecent<T>(items: T[], recent: string[], toKey: (item: T) => string) {
  const rank = new Map(recent.map((key, index) => [key, index]));
  return [...items].sort((left, right) => {
    const leftRank = rank.get(toKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(toKey(right)) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

export function orderedCategories(categories: Category[], recentIds: number[]) {
  const recent = new Set(recentIds);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return [
    ...recentIds.map((id) => categoryById.get(id)).filter((category): category is Category => Boolean(category)),
    ...categories.filter((category) => !recent.has(category.id))
  ];
}

export function mergeRecentTags(tags: Tag[], recentTags: string[]) {
  const existing = new Set(tags.map((tag) => tag.name));
  const recentOnly = recentTags
    .filter((name) => !existing.has(name))
    .map((name) => ({ id: name, name }));
  return [...recentOnly, ...tags];
}

export function withCatalogDefaults(form: PublishFormState, catalog: PublishTaxonomyCatalog): PublishFormState {
  const hasSelectedCategory = catalog.categories.some((category) => String(category.id) === form.categoryId);
  const recentCategoryId = catalog.recent_category_ids?.find((id) => catalog.categories.some((category) => category.id === id));
  const fallbackCategoryId = recentCategoryId ?? catalog.categories[0]?.id;
  return {
    categoryId: hasSelectedCategory ? form.categoryId : (fallbackCategoryId ? String(fallbackCategoryId) : ''),
    tags: form.tags || (catalog.last_published_tags ?? []).join(', ')
  };
}

export function addMissingTag(value: string, tag: string) {
  const tags = toTags(value);
  return tags.includes(tag) ? value : [...tags, tag].join(', ');
}

export function removeTag(value: string, tag: string) {
  return toTags(value).filter((entry) => entry !== tag).join(', ');
}

export function categoryParts(category: Category) {
  const parts = category.name.split(' / ').map((part) => part.trim()).filter(Boolean);
  return {
    depth: Math.max(parts.length - 1, 0),
    name: parts.at(-1) ?? category.name,
    path: parts.slice(0, -1).join(' / ')
  };
}
