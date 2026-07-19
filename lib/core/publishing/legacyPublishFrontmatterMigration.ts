import { isMap, parseDocument } from 'yaml';

import {
  type DiscourseTopicBinding,
  writeDiscourseTopicBinding
} from '../discourse/discourseFrontmatter.js';
import {
  type WordPressPostBinding,
  writeWordPressPostBinding
} from '../wordpress/wordpressFrontmatter.js';

import {
  joinMarkdownFrontmatter,
  readPublishProviderRecord,
  splitMarkdownFrontmatter
} from './publishFrontmatter.js';

const DISCOURSE_START = '# foliole:discourse-publish';
const DISCOURSE_END = '# /foliole:discourse-publish';
const WORDPRESS_START = '# foliole:wordpress-publish';
const WORDPRESS_END = '# /foliole:wordpress-publish';

export class LegacyPublishFrontmatterMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyPublishFrontmatterMigrationError';
  }
}

function createError(message: string) {
  return new LegacyPublishFrontmatterMigrationError(message);
}

function extractLegacyBlock(frontmatter: string, startMarker: string, endMarker: string) {
  const start = frontmatter.indexOf(startMarker);
  const end = frontmatter.indexOf(endMarker);
  if (start < 0 && end < 0) return { block: null, frontmatter };
  if (start < 0 || end < start) throw createError('Legacy publish frontmatter markers are malformed.');
  const blockEnd = end + endMarker.length;
  let removeStart = start;
  let removeEnd = blockEnd;
  if (frontmatter.startsWith('\r\n', removeEnd)) removeEnd += 2;
  else if (frontmatter.startsWith('\n', removeEnd)) removeEnd += 1;
  else if (frontmatter.slice(0, removeStart).endsWith('\r\n')) removeStart -= 2;
  else if (frontmatter.slice(0, removeStart).endsWith('\n')) removeStart -= 1;
  return {
    block: frontmatter.slice(start + startMarker.length, end).trim(),
    frontmatter: `${frontmatter.slice(0, removeStart)}${frontmatter.slice(removeEnd)}`
  };
}

function parseLegacyDocument(source: string) {
  const document = parseDocument(source, { logLevel: 'silent', strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw createError('Legacy publish frontmatter is not valid YAML.');
  }
  return document;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function parseLegacyDiscourse(source: string): DiscourseTopicBinding {
  const value = parseLegacyDocument(source).getIn(['publish', 'discourse'], true);
  if (!isMap(value)) throw createError('Legacy Discourse publish binding is incomplete.');
  const record = value.toJSON() as Record<string, unknown>;
  const { categoryId, lastPublishedAt, postId, site, tags, topicId, url } = record;
  if (!(categoryId === null || categoryId === '' || isPositiveInteger(categoryId))
    || !isString(lastPublishedAt) || !isPositiveInteger(postId) || !isString(site)
    || !Array.isArray(tags) || !tags.every(isString) || !isPositiveInteger(topicId) || !isString(url)) {
    throw createError('Legacy Discourse publish binding is incomplete.');
  }
  return { categoryId: categoryId === '' ? null : categoryId, lastPublishedAt, postId, site, tags, topicId, url };
}

function parseLegacyWordPress(source: string): WordPressPostBinding {
  const value = parseLegacyDocument(source).get('wordpressPublish', true);
  if (!isMap(value)) throw createError('Legacy WordPress publish binding is incomplete.');
  const record = value.toJSON() as Record<string, unknown>;
  const { adapter, lastPublishedAt, postId, site, url } = record;
  const normalizedPostId = typeof postId === 'number' && Number.isInteger(postId) && postId > 0
    ? String(postId)
    : postId;
  if ((adapter !== 'core_rest' && adapter !== 'wordpress_com_xmlrpc')
    || !isString(lastPublishedAt) || !isString(normalizedPostId) || !isString(site) || !isString(url)) {
    throw createError('Legacy WordPress publish binding is incomplete.');
  }
  return { adapter, lastPublishedAt, postId: normalizedPostId, site, url };
}

export function migrateLegacyPublishFrontmatter(content: string) {
  const parts = splitMarkdownFrontmatter(content, createError);
  if (parts.frontmatter === null) return content;
  const discourse = extractLegacyBlock(parts.frontmatter, DISCOURSE_START, DISCOURSE_END);
  const wordpress = extractLegacyBlock(discourse.frontmatter, WORDPRESS_START, WORDPRESS_END);
  if (!discourse.block && !wordpress.block) return content;
  let migrated = joinMarkdownFrontmatter(parts, wordpress.frontmatter);
  if (discourse.block) {
    if (readPublishProviderRecord(migrated, 'discourse', createError)) {
      throw createError('A current Discourse publish binding already exists.');
    }
    migrated = writeDiscourseTopicBinding(migrated, parseLegacyDiscourse(discourse.block));
  }
  if (wordpress.block) {
    if (readPublishProviderRecord(migrated, 'wordpress', createError)) {
      throw createError('A current WordPress publish binding already exists.');
    }
    migrated = writeWordPressPostBinding(migrated, parseLegacyWordPress(wordpress.block));
  }
  return migrated;
}
