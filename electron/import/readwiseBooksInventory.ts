import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportSourceKind } from '../../lib/core/import/contract.js';
import type { ImportSidecarHighlight } from '../../lib/core/import/controlledContext.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { resolveReadwiseBookFullDocumentMetadata } from './readwiseBookFullDocumentMetadata.js';
import { resolveGeneratedNodeId, resolveImportStatus } from './readwiseBooksInventoryDatabase.js';
import {
  createReadwiseBooksSourceSignature
} from './readwiseBooksInventorySignature.js';
import { mergePersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';
import { resolveInitialReadwiseBookHighlightState, resolveReadwiseBookBodyState } from './readwiseBookState.js';

export type ReadwiseBookAnnotationStatus = 'has_highlights' | 'no_highlights';
export type ReadwiseBookBodyState = 'loaded' | 'unloaded';
export type ReadwiseBookNodeStatus = 'generated' | 'missing';
export type ReadwiseBookEpubStatus = 'received' | 'missing';
export type ReadwiseBookHighlightState = 'failed' | 'partial' | 'pending' | 'placed';
export type ReadwiseBookImportStatus = 'completed' | 'pending';

export interface ReadwiseBookInventoryItem {
  annotationStatus: ReadwiseBookAnnotationStatus;
  bodyState: ReadwiseBookBodyState;
  bookKey: string;
  downloadUrl: string | null;
  epubPath: string | null;
  epubStatus: ReadwiseBookEpubStatus;
  fullDocumentMarkdownPath: string | null;
  generatedNodeId: string | null;
  highlightCount: number;
  highlightState: ReadwiseBookHighlightState | null;
  highlights: ImportSidecarHighlight[];
  highlightMarkdownPath: string | null;
  highlightUnmatchedCount: number | null;
  importStatus: ReadwiseBookImportStatus;
  metadataFrontmatter: string;
  nodeStatus: ReadwiseBookNodeStatus;
  summary: string | null;
  title: string;
}

export interface ReadwiseBooksInventory {
  books: ReadwiseBookInventoryItem[];
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  scannedAt: string;
  sourceSignature?: ReadwiseBooksSourceSignature;
}

export interface ReadwiseBooksSourceSignature {
  entries: Array<{
    kind: ImportSourceKind;
    mtimeMs: number;
    sizeBytes: number;
    sourceGroup: 'fullDocument' | 'highlight';
    sourceName: string;
  }>;
  version: 1;
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
    return { annotationStatus: 'no_highlights' as const, highlights: [] };
  }
  try {
    const markdown = await fs.readFile(bucket.highlightMarkdownPath, 'utf8');
    const highlights = extractReadwiseSidecarHighlights(markdown, readwiseConfig);
    return {
      annotationStatus: highlights.length > 0 ? 'has_highlights' as const : 'no_highlights' as const,
      highlights
    };
  } catch {
    return { annotationStatus: 'no_highlights' as const, highlights: [] };
  }
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
  const scannedInventory = {
    books: await Promise.all(
    collectBooksByKey(highlightSources, fullDocumentSources).map(async (bucket) => {
      const { annotationStatus, highlights } = await resolveAnnotationStatus(bucket, input.readwiseConfig);
      const fullDocumentMetadata = await resolveReadwiseBookFullDocumentMetadata(bucket.fullDocumentMarkdownPath);
      const generatedNodeId = resolveGeneratedNodeId(bucket);
      const importStatus = resolveImportStatus(bucket);
      const bodyState = resolveReadwiseBookBodyState(importStatus);
      return {
        annotationStatus,
        bodyState,
        bookKey: bucket.key,
        downloadUrl: fullDocumentMetadata.downloadUrl,
        epubPath: bucket.epubPath,
        epubStatus: bucket.epubPath ? 'received' : 'missing',
        fullDocumentMarkdownPath: bucket.fullDocumentMarkdownPath,
        generatedNodeId,
        highlightCount: highlights.length,
        highlightState: resolveInitialReadwiseBookHighlightState({ annotationStatus }),
        highlights,
        highlightMarkdownPath: bucket.highlightMarkdownPath,
        highlightUnmatchedCount: null,
        importStatus,
        metadataFrontmatter: fullDocumentMetadata.metadataFrontmatter,
        nodeStatus: generatedNodeId ? 'generated' : 'missing',
        summary: fullDocumentMetadata.summary,
        title: bucket.title
      } satisfies ReadwiseBookInventoryItem;
    })
  ),
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightDirectoryPath: input.highlightDirectoryPath,
    scannedAt,
    sourceSignature: createReadwiseBooksSourceSignature({ fullDocumentSources, highlightSources })
  } satisfies ReadwiseBooksInventory;
  return mergePersistedReadwiseBooksInventory({ currentInventory: scannedInventory });
}
