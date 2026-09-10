import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReadwiseFullDocumentFrontmatter } from '../../lib/core/import/readwiseFullDocumentParsing.js';
import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { openDatabaseConnection } from '../database/connection.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { READER_PARENT_CATEGORIES } from './readwiseApiCandidateTypes.js';
import { createReadwiseApiRequest, READWISE_READER_LIST_URL, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';

export interface ReadwiseSearchMetadata {
  id: string;
  title: string;
  author: string | null;
  kind: 'article' | 'book';
  remoteId?: string;
  createdAt?: string | null;
  ruleId?: string;
  sourcePath?: string;
  bookKey?: string;
  nodeId?: string | null;
  filePath?: string;
}

export async function loadApiSearchMetadata(dependencies: ReadwiseApiFetchDependencies = {}) {
  const request = createReadwiseApiRequest(dependencies);
  const result = new Map<string, ReadwiseSearchMetadata>();
  for (const category of READER_PARENT_CATEGORIES) {
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const url = new URL(READWISE_READER_LIST_URL);
      url.searchParams.set('category', category);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('pageCursor', cursor);
      const payload = await request(url);
      if (!Array.isArray(payload.results)) throw new Error('readwise_search_invalid_page');
      for (const value of payload.results) {
        const document = normalizeReaderDocument(value);
        if (!document || document.category !== category || document.parentId) {
          throw new Error('readwise_search_invalid_metadata');
        }
        result.set(document.id, {
          id: `api:${document.id}`, remoteId: document.id, title: document.title ?? '',
          author: document.author, kind: category === 'epub' ? 'book' : 'article',
          createdAt: document.createdAt ?? null
        });
      }
      cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor ? payload.nextPageCursor : null;
      if (cursor && (seen.has(cursor) || seen.size >= 1_000)) throw new Error('readwise_search_page_limit');
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
  return [...result.values()];
}

export function readSearchAuthor(markdown: string) {
  const metadata = extractReadwiseFullDocumentFrontmatter(markdown) || markdown;
  const value = /^\s*(?:-\s*)?(?:author|authors):\s*(.+)$/im.exec(metadata)?.[1]?.trim();
  return value?.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^['"]|['"]$/g, '') ?? null;
}

export async function loadFolderSearchMetadata() {
  const settings = loadImportManagerSettings();
  const result: ReadwiseSearchMetadata[] = [];
  for (const source of settings.readwiseSources.filter((item) => item.keepState === 'enabled')) {
    if (source.kind === 'books') {
      const { inventory } = await loadReadwiseBooksInventoryForPaths({
        fullDocumentDirectoryPath: source.primaryPath, highlightDirectoryPath: source.highlightPath,
        readwiseConfig: settings.readwiseReaderConfig
      });
      for (const book of inventory.books) {
        const location = book.fullDocumentMarkdownPath
          ? path.relative(inventory.fullDocumentDirectoryPath, book.fullDocumentMarkdownPath)
          : book.highlightMarkdownPath
            ? path.relative(inventory.highlightDirectoryPath, book.highlightMarkdownPath) : `${book.title}.md`;
        result.push({
          id: JSON.stringify([source.id, location]), ruleId: source.id, sourcePath: location,
          bookKey: book.bookKey, title: book.title, author: readSearchAuthor(book.metadataFrontmatter),
          kind: 'book', nodeId: book.generatedNodeId,
          ...(book.fullDocumentMarkdownPath ?? book.highlightMarkdownPath
            ? { filePath: (book.fullDocumentMarkdownPath ?? book.highlightMarkdownPath)! } : {})
        });
      }
    } else result.push(...await loadDiscoveredFolderMetadata(source.id));
  }
  return result;
}

async function loadDiscoveredFolderMetadata(ruleId: string) {
  const config = resolveKeepImportRuleConfig(ruleId);
  if (!config) throw new Error('readwise_search_source_unavailable');
  const rows = openDatabaseConnection().driver.queryAll<{ source_path: string }>(
    "SELECT source_path FROM keep_import_items WHERE rule_id = ? AND source_state = 'present'", [ruleId]
  );
  const result: ReadwiseSearchMetadata[] = [];
  for (const row of rows) {
    const source = await buildKeepImportSourceDescriptor(config, row.source_path);
    const markdown = await fs.readFile(source.filePath, 'utf8');
    result.push({
      id: JSON.stringify([ruleId, row.source_path]), ruleId, sourcePath: row.source_path,
      title: /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? path.basename(row.source_path, path.extname(row.source_path)),
      author: readSearchAuthor(markdown), kind: 'article', filePath: source.filePath
    });
  }
  return result;
}
