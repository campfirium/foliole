import { createHash } from 'node:crypto';

import { convertHtmlToMarkdownCompatible } from '../import/htmlToMarkdownCompatible.js';

export type ReaderCategory = 'article' | 'email' | 'epub' | 'highlight' | 'note' | 'pdf' | 'rss' | 'tweet' | 'video';

export interface ReaderDocumentContract {
  author: string | null;
  category: ReaderCategory | null;
  createdAt?: string | null;
  htmlContent: string | null;
  id: string;
  imageUrl: string | null;
  notes: string | null;
  parentId: string | null;
  rawSourceUrl: string | null;
  sourceUrl: string | null;
  summary: string | null;
  title: string | null;
  updatedAt: string | null;
  url: string | null;
}

export interface ExportBookContract {
  category: string | null;
  externalId: string | null;
  highlightExternalIds: string[];
  highlights: ExportHighlightContract[];
  isDeleted: boolean;
  source: string | null;
}

export interface ExportHighlightContract {
  externalId: string;
  isDeleted: boolean;
  note: string | null;
  text: string | null;
  updatedAt: string | null;
}

export function normalizeReaderDocument(value: unknown): ReaderDocumentContract | null {
  const row = record(value);
  const id = text(row.id);
  if (!id) return null;
  const category = text(row.category);
  return {
    author: text(row.author),
    category: isReaderCategory(category) ? category : null,
    createdAt: text(row.created_at),
    htmlContent: text(row.html_content),
    id,
    imageUrl: safeHttpUrl(row.image_url),
    notes: text(row.notes),
    parentId: text(row.parent_id),
    rawSourceUrl: safeRawSourceUrl(row.raw_source_url),
    sourceUrl: safeHttpUrl(row.source_url),
    summary: text(row.summary),
    title: text(row.title),
    updatedAt: text(row.updated_at),
    url: safeHttpUrl(row.url)
  };
}

export function normalizeExportBook(value: unknown): ExportBookContract | null {
  const row = record(value);
  const externalId = text(row.external_id);
  const source = text(row.source);
  if (!externalId && !text(row.user_book_id)) return null;
  const highlights = array(row.highlights)
    .map(normalizeExportHighlight).filter((item) => item !== null);
  return {
    category: text(row.category),
    externalId,
    highlightExternalIds: highlights.map((highlight) => highlight.externalId),
    highlights,
    isDeleted: row.is_deleted === true,
    source
  };
}

function normalizeExportHighlight(value: unknown): ExportHighlightContract | null {
  const row = record(value);
  const externalId = text(row.external_id);
  if (!externalId) return null;
  return {
    externalId,
    isDeleted: row.is_deleted === true,
    note: text(row.note),
    text: text(row.text),
    updatedAt: text(row.updated_at)
  };
}

export function resolveReaderBodyAncestor(
  id: string,
  byId: ReadonlyMap<string, ReaderDocumentContract>
): { documentId: string | null; reason: 'cycle' | 'missing_parent' | 'resolved' | 'unsupported_leaf' } {
  const seen = new Set<string>();
  let current = byId.get(id);
  if (!current) return { documentId: null, reason: 'missing_parent' };
  while (current.category === 'highlight' || current.category === 'note') {
    if (seen.has(current.id)) return { documentId: null, reason: 'cycle' };
    seen.add(current.id);
    if (!current.parentId) return { documentId: null, reason: 'missing_parent' };
    current = byId.get(current.parentId);
    if (!current) return { documentId: null, reason: 'missing_parent' };
  }
  if (!current.category) return { documentId: null, reason: 'unsupported_leaf' };
  return { documentId: current.id, reason: 'resolved' };
}

export function summarizeReaderBody(document: ReaderDocumentContract) {
  const converted = convertHtmlToMarkdownCompatible(document.htmlContent ?? '');
  return {
    category: document.category,
    htmlPresent: Boolean(document.htmlContent),
    markdownBytes: Buffer.byteLength(converted.content),
    markdownHash: converted.content ? sha256(converted.content) : null,
    readable: converted.content.trim().length > 0,
    warnings: converted.warnings
  };
}

export function stableShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [stableShape(value[0])] : [];
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableShape(item)]));
}

function safeRawSourceUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

function safeHttpUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? candidate : null;
  } catch {
    return null;
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isReaderCategory(value: string | null): value is ReaderCategory {
  return value !== null && ['article', 'email', 'epub', 'highlight', 'note', 'pdf', 'rss', 'tweet', 'video'].includes(value);
}
