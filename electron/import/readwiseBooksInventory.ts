import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { ensureReadwiseBookNodes } from './readwiseBookNodes.js';
import { resolveGeneratedNodeId, resolveImportStatus } from './readwiseBooksInventoryDatabase.js';
import {
  mergePersistedReadwiseBooksInventory,
  savePersistedReadwiseBooksInventory
} from './readwiseBooksInventoryState.js';

export type ReadwiseBookAnnotationStatus = 'has_highlights' | 'no_highlights';
export type ReadwiseBookNodeStatus = 'generated' | 'missing';
export type ReadwiseBookEpubStatus = 'received' | 'missing';
export type ReadwiseBookImportStatus = 'completed' | 'pending';

export interface ReadwiseBookInventoryItem {
  annotationStatus: ReadwiseBookAnnotationStatus;
  bookKey: string;
  downloadUrl: string | null;
  epubPath: string | null;
  epubStatus: ReadwiseBookEpubStatus;
  fullDocumentMarkdownPath: string | null;
  generatedNodeId: string | null;
  highlightMarkdownPath: string | null;
  importStatus: ReadwiseBookImportStatus;
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
  downloadUrl: string | null;
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

function createBucket(sourceName: string): ReadwiseBookSourceBucket {
  return {
    downloadUrl: null,
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

async function isDirectoryAvailable(rootDir: string) {
  if (!rootDir.trim()) {
    return false;
  }
  try {
    return (await fs.stat(rootDir)).isDirectory();
  } catch {
    return false;
  }
}

function extractReadwiseDownloadUrl(markdown: string) {
  const directDownloadMatch = /\[Download original file[^\]]*]\((https?:\/\/[^)\s]+)\)/i.exec(markdown);
  if (directDownloadMatch?.[1]) {
    return directDownloadMatch[1];
  }
  const documentRawContentMatch = /(https?:\/\/\S*\/document_raw_content\/\d+\S*)/i.exec(markdown);
  if (documentRawContentMatch?.[1]) {
    return documentRawContentMatch[1];
  }
  const metadataDownloadMatch =
    /(?:^|\n)-?\s*(?:epub_download_url|download_url|epub_url|book_download_url|download url)\s*:\s*(https?:\/\/\S+)/i.exec(
      markdown
    );
  return metadataDownloadMatch?.[1] ?? null;
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

async function resolveDownloadUrl(bucket: ReadwiseBookSourceBucket) {
  if (!bucket.fullDocumentMarkdownPath) {
    return null;
  }
  try {
    const markdown = await fs.readFile(bucket.fullDocumentMarkdownPath, 'utf8');
    return extractReadwiseDownloadUrl(markdown);
  } catch {
    return null;
  }
}

export async function scanReadwiseBooksInventory(input: {
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  readwiseConfig: ReadwiseReaderConfig;
}): Promise<ReadwiseBooksInventory> {
  const scannedAt = new Date().toISOString();
  const [highlightDirectoryAvailable, fullDocumentDirectoryAvailable, highlightSources, fullDocumentSources] = await Promise.all([
    isDirectoryAvailable(input.highlightDirectoryPath),
    isDirectoryAvailable(input.fullDocumentDirectoryPath),
    discoverSources(input.highlightDirectoryPath, ['markdown']),
    discoverSources(input.fullDocumentDirectoryPath, ['epub', 'markdown'])
  ]);
  const scannedInventory = {
    books: await Promise.all(
    collectBooksByKey(highlightSources, fullDocumentSources).map(async (bucket) => {
      const annotationStatus = await resolveAnnotationStatus(bucket, input.readwiseConfig);
      const downloadUrl = await resolveDownloadUrl(bucket);
      const generatedNodeId = resolveGeneratedNodeId(bucket);
      return {
        annotationStatus,
        bookKey: bucket.key,
        downloadUrl,
        epubPath: bucket.epubPath,
        epubStatus: bucket.epubPath ? 'received' : 'missing',
        fullDocumentMarkdownPath: bucket.fullDocumentMarkdownPath,
        generatedNodeId,
        highlightMarkdownPath: bucket.highlightMarkdownPath,
        importStatus: resolveImportStatus(bucket),
        nodeStatus: generatedNodeId ? 'generated' : 'missing',
        title: bucket.title
      } satisfies ReadwiseBookInventoryItem;
    })
  ),
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightDirectoryPath: input.highlightDirectoryPath,
    scannedAt
  } satisfies ReadwiseBooksInventory;
  const inventory = mergePersistedReadwiseBooksInventory({
    currentInventory: ensureReadwiseBookNodes(scannedInventory),
    restoreMissingBooks: !highlightDirectoryAvailable || !fullDocumentDirectoryAvailable
  });
  savePersistedReadwiseBooksInventory(inventory);
  return inventory;
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
