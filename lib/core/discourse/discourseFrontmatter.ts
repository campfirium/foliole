import {
  readPublishProviderRecord,
  serializeYamlString,
  splitMarkdownFrontmatter,
  writePublishProviderRecord
} from '../publishing/publishFrontmatter.js';

export interface DiscourseTopicBinding {
  categoryId: number | null;
  lastPublishedAt: string;
  postId: number;
  site: string;
  tags: string[];
  topicId: number;
  url: string;
}

export interface DiscoursePublishedMeta {
  lastPublishedAt: string;
  url: string;
}

export type DiscoursePublishMode = 'create' | 'update';

export class DiscourseFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscourseFrontmatterError';
  }
}

const MANAGED_BLOCK_START = '# foliole:discourse-publish';
const MANAGED_BLOCK_END = '# /foliole:discourse-publish';

function createError(message: string) {
  return new DiscourseFrontmatterError(message);
}

function assertNoLegacyBinding(content: string) {
  const frontmatter = splitMarkdownFrontmatter(content, createError).frontmatter;
  if (frontmatter?.includes(MANAGED_BLOCK_START) || frontmatter?.includes(MANAGED_BLOCK_END)) {
    throw createError('Legacy Discourse publish frontmatter must be migrated before use.');
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\r\n]/u.test(value);
}

function hasExactKeys(record: Record<string, unknown>) {
  const keys = ['categoryId', 'lastPublishedAt', 'postId', 'site', 'tags', 'topicId', 'url'];
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function parseBinding(record: Record<string, unknown>): DiscourseTopicBinding {
  const { categoryId, lastPublishedAt, postId, site, tags, topicId, url } = record;
  const validCategory = categoryId === null || isPositiveInteger(categoryId);
  const validTags = Array.isArray(tags) && tags.every(isNonEmptyString);
  if (!hasExactKeys(record) || !validCategory || !validTags || !isNonEmptyString(lastPublishedAt)
    || !isPositiveInteger(postId) || !isNonEmptyString(site)
    || !isPositiveInteger(topicId) || !isNonEmptyString(url)) {
    throw createError('Discourse publish binding is incomplete.');
  }
  return { categoryId, lastPublishedAt, postId, site, tags, topicId, url };
}

export function readDiscourseTopicBinding(content: string): DiscourseTopicBinding | null {
  assertNoLegacyBinding(content);
  const record = readPublishProviderRecord(content, 'discourse', createError);
  return record ? parseBinding(record) : null;
}

export function readDiscoursePublishedMeta(content: string): DiscoursePublishedMeta | null {
  try {
    const binding = readDiscourseTopicBinding(content);
    return binding ? { lastPublishedAt: binding.lastPublishedAt, url: binding.url } : null;
  } catch {
    return null;
  }
}

export function readDiscoursePublishMarkdown(content: string) {
  return stripOpeningH1(splitMarkdownFrontmatter(content, createError).body);
}

function stripOpeningH1(content: string) {
  const match = /^(?:[ \t]*\r?\n)*[ \t]{0,3}#(?!#)[ \t]+[^\r\n]*(?:\r?\n)?(?:[ \t]*\r?\n)?/u.exec(content);
  return match ? content.slice(match[0].length) : content;
}

function serializeBinding(binding: DiscourseTopicBinding) {
  const tags = binding.tags.length > 0
    ? ['      tags:', ...binding.tags.map((tag) => `        - ${serializeYamlString(tag)}`)]
    : ['      tags: []'];
  return [
    '    discourse:',
    `      site: ${serializeYamlString(binding.site)}`,
    `      topicId: ${binding.topicId}`,
    `      postId: ${binding.postId}`,
    `      url: ${serializeYamlString(binding.url)}`,
    `      categoryId: ${binding.categoryId ?? 'null'}`,
    ...tags,
    `      lastPublishedAt: ${serializeYamlString(binding.lastPublishedAt, true)}`
  ].join('\n');
}

export function writeDiscourseTopicBinding(content: string, binding: DiscourseTopicBinding) {
  assertNoLegacyBinding(content);
  const validated = parseBinding(binding as unknown as Record<string, unknown>);
  return writePublishProviderRecord(content, 'discourse', serializeBinding(validated), createError);
}

export function resolveDiscoursePublishMode(content: string): DiscoursePublishMode {
  return readDiscourseTopicBinding(content) ? 'update' : 'create';
}
