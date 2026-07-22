import {
  readPublishProviderRecord,
  serializeYamlString,
  splitMarkdownFrontmatter,
  stripOpeningPublishTitle,
  writePublishProviderRecord
} from '../publishing/publishFrontmatter.js';

export type WordPressPublishAdapter = 'core_rest' | 'wordpress_com_xmlrpc';

export interface WordPressPostBinding {
  adapter: WordPressPublishAdapter;
  lastPublishedAt: string;
  postId: string;
  site: string;
  url: string;
}

export class WordPressFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordPressFrontmatterError';
  }
}

function createError(message: string) {
  return new WordPressFrontmatterError(message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\r\n]/u.test(value);
}

function parseBinding(record: Record<string, unknown>): WordPressPostBinding {
  const keys = ['adapter', 'lastPublishedAt', 'postId', 'site', 'url'];
  const { adapter, lastPublishedAt, postId, site, url } = record;
  const exactShape = Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
  if (!exactShape || (adapter !== 'core_rest' && adapter !== 'wordpress_com_xmlrpc')
    || !isNonEmptyString(lastPublishedAt) || !isNonEmptyString(postId)
    || !isNonEmptyString(site) || !isNonEmptyString(url)) {
    throw createError('WordPress publish binding is incomplete.');
  }
  return { adapter, lastPublishedAt, postId, site, url };
}

export function readWordPressPostBinding(content: string): WordPressPostBinding | null {
  const record = readPublishProviderRecord(content, 'wordpress', createError);
  return record ? parseBinding(record) : null;
}

function serializeBinding(binding: WordPressPostBinding) {
  return [
    '    wordpress:',
    `      site: ${serializeYamlString(binding.site)}`,
    `      adapter: ${binding.adapter}`,
    `      postId: ${serializeYamlString(binding.postId, true)}`,
    `      url: ${serializeYamlString(binding.url)}`,
    `      lastPublishedAt: ${serializeYamlString(binding.lastPublishedAt, true)}`
  ].join('\n');
}

export function writeWordPressPostBinding(content: string, binding: WordPressPostBinding) {
  const validated = parseBinding(binding as unknown as Record<string, unknown>);
  return writePublishProviderRecord(content, 'wordpress', serializeBinding(validated), createError);
}

export function readWordPressPublishMarkdown(content: string) {
  const body = splitMarkdownFrontmatter(content, createError).body;
  return stripOpeningPublishTitle(body);
}

export function extractWordPressPublishTitle(content: string, fallback: string) {
  const body = splitMarkdownFrontmatter(content, createError).body;
  const title = /^(?:[ \t]*\r?\n)*[ \t]{0,3}#(?!#)[ \t]+([^\r\n]+)/u.exec(body)?.[1]?.trim();
  return title || fallback.trim() || 'Untitled';
}
