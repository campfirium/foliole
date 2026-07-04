import { readDiscourseTopicBinding, resolveDiscoursePublishMode } from '../../../lib/core/discourse/discourseFrontmatter';
import { extractDiscoursePublishTitle } from '../../../lib/core/discourse/discoursePublishTitle';

export type PublishDetails = {
  bindingUrl: string | null;
  categoryId: number | null;
  mode: 'create' | 'update';
  parseError: string | null;
  tags: string[];
};

export type PublishFormState = { categoryId: string; tags: string };

export function readPublishDetails(content: string): PublishDetails {
  try {
    const binding = readDiscourseTopicBinding(content);
    return {
      bindingUrl: binding?.url ?? null,
      categoryId: binding?.categoryId ?? null,
      mode: resolveDiscoursePublishMode(content),
      parseError: null,
      tags: binding?.tags ?? []
    };
  } catch (error) {
    return {
      bindingUrl: null,
      categoryId: null,
      mode: 'create',
      parseError: error instanceof Error ? error.message : 'Invalid Discourse publish frontmatter.',
      tags: []
    };
  }
}

export function readPublishTitle(content: string, fallback: string) {
  return extractDiscoursePublishTitle(content, fallback);
}

export function toTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export function addTag(value: string, tag: string) {
  const tags = toTags(value);
  return tags.includes(tag) ? tags.filter((entry) => entry !== tag).join(', ') : [...tags, tag].join(', ');
}

export function toCategoryId(value: string, invalidMessage: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(invalidMessage);
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(invalidMessage);
  }
  return parsed;
}
