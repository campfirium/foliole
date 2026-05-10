import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview,
  NativeWorkspaceSearchResult
} from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

export const READWISE_EXTERNAL_FOLDER_ID = 'managed-readwise-reader';
const READWISE_EXTERNAL_FOLDER_PATH = 'Readwise';
const READWISE_EXTERNAL_PATH_PREFIX = 'readwise://reader/';

interface ReadwiseExternalRow extends DatabaseRow {
  annotation_text: string | null;
  author: string | null;
  category: string | null;
  remote_updated_at: string | null;
  source_id: string;
  source_url: string | null;
  tags_json: string;
  title: string;
  updated_at: string;
}

export function isReadwiseExternalFolderId(folderId: string) {
  return folderId === READWISE_EXTERNAL_FOLDER_ID;
}

export function isReadwiseExternalPath(absolutePath: string) {
  return absolutePath.startsWith(READWISE_EXTERNAL_PATH_PREFIX);
}

export function loadReadwiseExternalFolder(): NativeExternalSearchFolder | null {
  const summary = openDatabaseConnection().driver.queryOne<{ count: number; updated_at: string | null }>(
    `SELECT COUNT(*) AS count, MAX(updated_at) AS updated_at
     FROM document_sources
     WHERE provider = 'readwise_reader' AND presentation_state = 'external'`
  );
  const count = Number(summary?.count ?? 0);
  if (count <= 0) return null;
  const now = new Date().toISOString();
  return {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: summary?.updated_at ?? now,
    document_count: count,
    excluded_dirs: [],
    folder_path: READWISE_EXTERNAL_FOLDER_PATH,
    id: READWISE_EXTERNAL_FOLDER_ID,
    indexed_at: summary?.updated_at ?? null,
    last_error: null,
    source_kind: 'readwise_reader',
    status: 'ready',
    updated_at: summary?.updated_at ?? now
  };
}

export function loadReadwiseExternalBrowseEntries(): NativeExternalSearchBrowseEntry[] {
  return readExternalRows()
    .map((row) => toBrowseEntry(row))
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path, undefined, { numeric: true, sensitivity: 'base' }));
}

export function loadReadwiseExternalPreview(absolutePath: string): NativeExternalSearchPreview | null {
  const row = readExternalRowByPath(absolutePath);
  if (!row) return null;
  const entry = toBrowseEntry(row);
  return {
    absolute_path: entry.absolute_path,
    content: buildPreviewContent(row),
    extension: 'md',
    file_name: entry.file_name,
    folder_id: READWISE_EXTERNAL_FOLDER_ID,
    folder_path: READWISE_EXTERNAL_FOLDER_PATH,
    relative_path: entry.relative_path
  };
}

export function searchReadwiseExternalDocuments(query: string): NativeWorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  return readExternalRows()
    .filter((row) => searchableText(row).toLowerCase().includes(normalizedQuery))
    .slice(0, 20)
    .map((row) => {
      const entry = toBrowseEntry(row);
      return {
        excerpt: buildExcerpt(searchableText(row), normalizedQuery),
        externalMatch: {
          absolutePath: entry.absolute_path,
          folderId: READWISE_EXTERNAL_FOLDER_ID,
          folderPath: READWISE_EXTERNAL_FOLDER_PATH,
          query: normalizedQuery,
          relativePath: entry.relative_path
        },
        id: entry.absolute_path,
        kind: 'external',
        nodeMatch: null,
        pdfMatch: null,
        title: entry.title,
        updatedAt: entry.modified_at
      };
    });
}

function readExternalRows() {
  return openDatabaseConnection().driver.queryAll<ReadwiseExternalRow>(
    `SELECT
       document_sources.source_id,
       COALESCE(document_sources.title, document_sources.source_name) AS title,
       document_sources.author,
       readwise_sources.category,
       document_sources.source_url,
       document_sources.tags_json,
       document_sources.remote_updated_at,
       document_sources.updated_at,
       (SELECT group_concat(COALESCE(text, note), char(10))
        FROM readwise_source_annotations
        WHERE readwise_source_annotations.source_id = document_sources.source_id
          AND deleted_at IS NULL) AS annotation_text
     FROM document_sources
     LEFT JOIN readwise_sources ON readwise_sources.source_id = document_sources.source_id
     WHERE document_sources.provider = 'readwise_reader'
       AND document_sources.presentation_state = 'external'
     ORDER BY document_sources.updated_at DESC`
  );
}

function readExternalRowByPath(absolutePath: string) {
  const sourceId = decodeURIComponent(absolutePath.slice(READWISE_EXTERNAL_PATH_PREFIX.length));
  return openDatabaseConnection().driver.queryOne<ReadwiseExternalRow>(
    `SELECT
       document_sources.source_id,
       COALESCE(document_sources.title, document_sources.source_name) AS title,
       document_sources.author,
       readwise_sources.category,
       document_sources.source_url,
       document_sources.tags_json,
       document_sources.remote_updated_at,
       document_sources.updated_at,
       (SELECT group_concat(COALESCE(text, note), char(10))
        FROM readwise_source_annotations
        WHERE readwise_source_annotations.source_id = document_sources.source_id
          AND deleted_at IS NULL) AS annotation_text
     FROM document_sources
     LEFT JOIN readwise_sources ON readwise_sources.source_id = document_sources.source_id
     WHERE document_sources.provider = 'readwise_reader'
       AND document_sources.presentation_state = 'external'
       AND document_sources.source_id = ?`,
    [sourceId]
  );
}

function toBrowseEntry(row: ReadwiseExternalRow): NativeExternalSearchBrowseEntry {
  const title = row.title.trim() || 'Untitled Readwise topic';
  return {
    absolute_path: `${READWISE_EXTERNAL_PATH_PREFIX}${encodeURIComponent(row.source_id)}`,
    extension: 'md',
    file_name: `${sanitizeSegment(title)}.md`,
    folder_id: READWISE_EXTERNAL_FOLDER_ID,
    folder_path: READWISE_EXTERNAL_FOLDER_PATH,
    modified_at: row.remote_updated_at ?? row.updated_at,
    opening_text: buildOpeningText(row),
    relative_path: `${sanitizeSegment(row.category || 'Library')}/${sanitizeSegment(title)}.md`,
    title
  };
}

function buildOpeningText(row: ReadwiseExternalRow) {
  return row.annotation_text?.replace(/\s+/g, ' ').trim().slice(0, 180) || row.source_url || null;
}

function buildPreviewContent(row: ReadwiseExternalRow) {
  const lines = [`# ${row.title.trim() || 'Untitled Readwise topic'}`, ''];
  if (row.author) lines.push(`Author: ${row.author}`);
  if (row.source_url) lines.push(`Source: ${row.source_url}`);
  const tags = parseTags(row.tags_json);
  if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);
  lines.push('', '## Highlights', '');
  lines.push(row.annotation_text?.trim() || 'No synced highlights.');
  return lines.join('\n');
}

function searchableText(row: ReadwiseExternalRow) {
  return [row.title, row.author, row.category, row.source_url, parseTags(row.tags_json).join(' '), row.annotation_text]
    .filter(Boolean)
    .join('\n');
}

function buildExcerpt(text: string, query: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const matchIndex = normalized.toLowerCase().indexOf(query);
  if (matchIndex < 0) return normalized.slice(0, 96);
  const start = Math.max(0, matchIndex - 36);
  const end = Math.min(normalized.length, matchIndex + query.length + 36);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`;
}

function parseTags(tagsJson: string) {
  const parsed = JSON.parse(tagsJson) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function sanitizeSegment(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 96) || 'Untitled';
}
