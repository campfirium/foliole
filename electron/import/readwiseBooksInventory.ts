import fs from 'node:fs/promises';
import path from 'node:path';

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection } from '../database/connection.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';

const DEFAULT_IMPORTED_AT = '1970-01-01T00:00:00.000Z';

export type ReadwiseBookAnnotationStatus = 'has_highlights' | 'no_highlights';
export type ReadwiseBookNodeStatus = 'generated' | 'missing';
export type ReadwiseBookEpubStatus = 'received' | 'missing';

export interface ReadwiseBookInventoryItem {
  annotationStatus: ReadwiseBookAnnotationStatus;
  bookKey: string;
  epubPath: string | null;
  epubStatus: ReadwiseBookEpubStatus;
  fullDocumentMarkdownPath: string | null;
  generatedNodeId: string | null;
  highlightMarkdownPath: string | null;
  nodeStatus: ReadwiseBookNodeStatus;
  title: string;
}

export interface ReadwiseBooksInventory {
  books: ReadwiseBookInventoryItem[];
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  scannedAt: string;
}

interface ReadwiseBookSourceBucket {
  epubPath: string | null;
  fullDocumentMarkdownPath: string | null;
  highlightMarkdownPath: string | null;
  key: string;
  sourceName: string;
  title: string;
}

function stripExtension(sourceName: string) {
  return sourceName.replace(/\.[^.]+$/u, '');
}

function createBookKey(sourceName: string) {
  return stripExtension(sourceName).replace(/\\/g, '/').trim().toLowerCase();
}

function buildReadwiseBookSourceIdentity(sourceName: string) {
  return `readwise/books/${sourceName.replace(/\\/g, '/')}`;
}

function createBucket(sourceName: string): ReadwiseBookSourceBucket {
  return {
    epubPath: null,
    fullDocumentMarkdownPath: null,
    highlightMarkdownPath: null,
    key: createBookKey(sourceName),
    sourceName,
    title: path.basename(stripExtension(sourceName))
  };
}

async function discoverSources(rootDir: string, supportedKinds: Array<'epub' | 'markdown'>) {
  if (!rootDir.trim()) {
    return [];
  }
  try {
    return await discoverDirectoryImportSources(rootDir, { supportedKinds });
  } catch {
    return [];
  }
}

function collectBooksByKey(
  highlightSources: DirectoryImportSourceDescriptor[],
  fullDocumentSources: DirectoryImportSourceDescriptor[]
) {
  const booksByKey = new Map<string, ReadwiseBookSourceBucket>();

  function getBucket(sourceName: string) {
    const key = createBookKey(sourceName);
    const existing = booksByKey.get(key);
    if (existing) {
      return existing;
    }
    const created = createBucket(sourceName);
    booksByKey.set(key, created);
    return created;
  }

  for (const source of highlightSources) {
    getBucket(source.sourceName).highlightMarkdownPath = source.filePath;
  }
  for (const source of fullDocumentSources) {
    const bucket = getBucket(source.sourceName);
    if (source.kind === 'epub') {
      bucket.epubPath = source.filePath;
      continue;
    }
    bucket.fullDocumentMarkdownPath = source.filePath;
  }

  return [...booksByKey.values()].sort((left, right) => left.title.localeCompare(right.title));
}

async function resolveAnnotationStatus(bucket: ReadwiseBookSourceBucket, readwiseConfig: ReadwiseReaderConfig) {
  if (!bucket.highlightMarkdownPath) {
    return 'no_highlights' as const;
  }
  try {
    const markdown = await fs.readFile(bucket.highlightMarkdownPath, 'utf8');
    return extractReadwiseSidecarHighlights(markdown, readwiseConfig).length > 0 ? 'has_highlights' : 'no_highlights';
  } catch {
    return 'no_highlights' as const;
  }
}

function resolveTrackedSourceName(bucket: ReadwiseBookSourceBucket) {
  if (bucket.fullDocumentMarkdownPath) {
    return `${stripExtension(bucket.sourceName)}.md`;
  }
  if (bucket.highlightMarkdownPath) {
    return `${stripExtension(bucket.sourceName)}.md`;
  }
  if (bucket.epubPath) {
    return `${stripExtension(bucket.sourceName)}.md`;
  }
  return null;
}

function resolveGeneratedNodeId(bucket: ReadwiseBookSourceBucket) {
  const trackedSourceName = resolveTrackedSourceName(bucket);
  if (!trackedSourceName) {
    return null;
  }

  const trackedFingerprint = createPreparedDesktopTextImport({
    content: '',
    fileName: path.basename(trackedSourceName),
    filePath: bucket.fullDocumentMarkdownPath ?? bucket.highlightMarkdownPath ?? bucket.epubPath ?? trackedSourceName,
    importedAt: DEFAULT_IMPORTED_AT,
    kind: 'markdown',
    sourceIdentity: buildReadwiseBookSourceIdentity(trackedSourceName)
  }).sourceFingerprint;
  const connection = openDatabaseConnection();
  const trackedRow = connection.sqlite
    .prepare(
      `SELECT latest_node_id
       FROM import_sources
       WHERE source_fingerprint = ? AND latest_node_id IS NOT NULL`
    )
    .get(trackedFingerprint) as { latest_node_id: string } | undefined;
  if (trackedRow?.latest_node_id) {
    return trackedRow.latest_node_id;
  }

  const fallbackLocators = [bucket.fullDocumentMarkdownPath, bucket.highlightMarkdownPath].filter(
    (value): value is string => Boolean(value)
  );
  if (fallbackLocators.length === 0) {
    return null;
  }
  const placeholder = fallbackLocators.map(() => '?').join(', ');
  const fallbackRow = connection.sqlite
    .prepare(
      `SELECT latest_node_id
       FROM import_sources
       WHERE latest_node_id IS NOT NULL AND source_locator IN (${placeholder})
       ORDER BY last_imported_at DESC
       LIMIT 1`
    )
    .get(...fallbackLocators) as { latest_node_id: string } | undefined;
  return fallbackRow?.latest_node_id ?? null;
}

export async function scanReadwiseBooksInventory(input: {
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  readwiseConfig: ReadwiseReaderConfig;
}): Promise<ReadwiseBooksInventory> {
  const scannedAt = new Date().toISOString();
  const [highlightSources, fullDocumentSources] = await Promise.all([
    discoverSources(input.highlightDirectoryPath, ['markdown']),
    discoverSources(input.fullDocumentDirectoryPath, ['epub', 'markdown'])
  ]);
  const books = await Promise.all(
    collectBooksByKey(highlightSources, fullDocumentSources).map(async (bucket) => {
      const annotationStatus = await resolveAnnotationStatus(bucket, input.readwiseConfig);
      const generatedNodeId = resolveGeneratedNodeId(bucket);
      return {
        annotationStatus,
        bookKey: bucket.key,
        epubPath: bucket.epubPath,
        epubStatus: bucket.epubPath ? 'received' : 'missing',
        fullDocumentMarkdownPath: bucket.fullDocumentMarkdownPath,
        generatedNodeId,
        highlightMarkdownPath: bucket.highlightMarkdownPath,
        nodeStatus: generatedNodeId ? 'generated' : 'missing',
        title: bucket.title
      } satisfies ReadwiseBookInventoryItem;
    })
  );
  return {
    books,
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightDirectoryPath: input.highlightDirectoryPath,
    scannedAt
  };
}

export async function loadReadwiseBooksInventory() {
  const settings = loadImportManagerSettings();
  const booksSource = settings.readwiseSources.find((source) => source.kind === 'books');
  return scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: booksSource?.primaryPath.trim() ?? '',
    highlightDirectoryPath: booksSource?.highlightPath.trim() ?? '',
    readwiseConfig: settings.readwiseReaderConfig
  });
}
