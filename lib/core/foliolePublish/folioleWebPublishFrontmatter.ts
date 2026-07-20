import { isMap, isScalar, parseDocument } from 'yaml';

import {
  readPublishProviderRecord,
  serializeYamlString,
  splitMarkdownFrontmatter,
  writePublishProviderRecord
} from '../publishing/publishFrontmatter.js';

export type FolioleWebFieldValue = string | string[];
export interface FolioleWebField { key: string; value: FolioleWebFieldValue }
export interface FolioleWebBinding {
  fields: FolioleWebField[];
  lastPublishedAt: string;
  pageId: string;
  site: string;
  url: string;
}

export class FolioleWebFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolioleWebFrontmatterError';
  }
}

const KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
const createError = (message: string) => new FolioleWebFrontmatterError(message);

export function normalizeFolioleWebFields(fields: FolioleWebField[]) {
  const seen = new Set<string>();
  return fields.map((field) => {
    if (!KEY.test(field.key) || seen.has(field.key)) throw createError('Web publish field keys must be unique YAML identifiers.');
    seen.add(field.key);
    if (typeof field.value === 'string') return { key: field.key, value: field.value };
    if (!Array.isArray(field.value) || !field.value.every((value) => typeof value === 'string')) {
      throw createError('Web publish field values must be strings or string lists.');
    }
    return { key: field.key, value: [...new Set(field.value)] };
  });
}

function parseFields(value: unknown): FolioleWebField[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw createError('Web publish fields must be a YAML mapping.');
  return normalizeFolioleWebFields(Object.entries(value).map(([key, fieldValue]) => ({ key, value: fieldValue as FolioleWebFieldValue })));
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\r\n]/u.test(value);
}

export function readFolioleWebBinding(content: string): FolioleWebBinding | null {
  const record = readPublishProviderRecord(content, 'web', createError);
  if (!record) return null;
  const keys = ['fields', 'lastPublishedAt', 'pageId', 'site', 'url'];
  if (Object.keys(record).length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))
    || !validText(record.lastPublishedAt) || !validText(record.pageId) || !validText(record.site) || !validText(record.url)) {
    throw createError('Web publish binding is incomplete.');
  }
  return {
    fields: parseFields(record.fields),
    lastPublishedAt: record.lastPublishedAt,
    pageId: record.pageId,
    site: record.site,
    url: record.url
  };
}

function serializeFields(fields: FolioleWebField[]) {
  if (fields.length === 0) return ['      fields: {}'];
  return ['      fields:', ...fields.flatMap(({ key, value }) => Array.isArray(value)
    ? value.length === 0
      ? [`        ${key}: []`]
      : [`        ${key}:`, ...value.map((item) => `          - ${serializeYamlString(item)}`)]
    : [`        ${key}: ${serializeYamlString(value)}`])];
}

export function writeFolioleWebBinding(content: string, binding: FolioleWebBinding) {
  const fields = normalizeFolioleWebFields(binding.fields);
  if (![binding.lastPublishedAt, binding.pageId, binding.site, binding.url].every(validText)) {
    throw createError('Web publish binding is incomplete.');
  }
  const source = [
    '    web:',
    `      pageId: ${serializeYamlString(binding.pageId)}`,
    `      site: ${serializeYamlString(binding.site)}`,
    `      url: ${serializeYamlString(binding.url)}`,
    ...serializeFields(fields),
    `      lastPublishedAt: ${serializeYamlString(binding.lastPublishedAt, true)}`
  ].join('\n');
  return writePublishProviderRecord(content, 'web', source, createError);
}

export function readFolioleWebYamlCandidates(content: string): FolioleWebField[] {
  const parts = splitMarkdownFrontmatter(content, createError);
  if (parts.frontmatter === null) return [];
  const document = parseDocument(parts.frontmatter, { logLevel: 'silent', strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents)) throw createError('Topic frontmatter is not valid YAML.');
  const result: FolioleWebField[] = [];
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === 'foliole' || !KEY.test(pair.key.value)) continue;
    if (isScalar(pair.value) && typeof pair.value.value === 'string') {
      result.push({ key: pair.key.value, value: pair.value.value });
      continue;
    }
    if (pair.value && 'items' in pair.value && Array.isArray(pair.value.items)) {
      const values = pair.value.items.map((item) => isScalar(item) && typeof item.value === 'string' ? item.value : null);
      if (values.every((value): value is string => value !== null)) result.push({ key: pair.key.value, value: values });
    }
  }
  return result;
}

export function readFolioleWebMarkdown(content: string) {
  return splitMarkdownFrontmatter(content, createError).body;
}
