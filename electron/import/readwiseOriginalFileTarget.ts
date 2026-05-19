import fs from 'node:fs/promises';
import path from 'node:path';

import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import {
  extractReadwiseDownloadUrl,
  type ReadwiseBookInventoryItem,
  type ReadwiseBooksInventory
} from './readwiseBooksInventory.js';
import { loadReadwiseBooksInventory } from './readwiseBooksInventoryLoad.js';
import { findPersistedReadwiseBookByNodeId } from './readwiseBooksInventoryState.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

export type ReadwiseOriginalFileTarget =
  | {
      book: ReadwiseBookInventoryItem;
      inventory: ReadwiseBooksInventory;
      kind: 'book';
      nodeId: string;
    }
  | {
      bookKey: null;
      downloadUrl: string | null;
      highlightMarkdownPath: string | null;
      kind: 'topic';
      nodeId: string;
      title: string;
    };

async function loadBookTargetByNodeId(nodeId: string) {
  const inventory = await loadReadwiseBooksInventory();
  const book =
    inventory.books.find(
      (candidate) =>
        candidate.generatedNodeId === nodeId || buildReadwiseBookPlaceholderNodeId(candidate.bookKey) === nodeId
    ) ?? null;
  if (book) {
    return { book, inventory, kind: 'book' as const, nodeId };
  }
  const persisted = findPersistedReadwiseBookByNodeId(nodeId);
  return persisted ? { ...persisted, kind: 'book' as const, nodeId } : null;
}

async function readDownloadUrl(markdownPath: string) {
  try {
    return extractReadwiseDownloadUrl(await fs.readFile(markdownPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveNodeTitle(nodeId: string, sourceName: string) {
  const details = loadNodeSourceDetails(nodeId);
  const heading = /^#\s+(.+)$/m.exec(details?.sourceNodeContent ?? '')?.[1]?.trim();
  return heading || path.basename(sourceName).replace(/\.[^.]+$/u, '') || 'this topic';
}

export async function loadReadwiseOriginalFileTarget(nodeId: string): Promise<ReadwiseOriginalFileTarget | null> {
  const bookTarget = await loadBookTargetByNodeId(nodeId);
  if (bookTarget) {
    return bookTarget;
  }

  const source = await resolveReadwiseTopicMergeSource(nodeId);
  if (!source) {
    return null;
  }
  return {
    bookKey: null,
    downloadUrl: await readDownloadUrl(source.descriptor.filePath),
    highlightMarkdownPath: source.readwiseSource.highlightPath.trim()
      ? path.join(source.readwiseSource.highlightPath, source.descriptor.sourceName)
      : null,
    kind: 'topic',
    nodeId: source.sourceNodeId,
    title: resolveNodeTitle(source.sourceNodeId, source.descriptor.sourceName)
  };
}

export function getReadwiseOriginalFileTargetTitle(target: ReadwiseOriginalFileTarget) {
  return target.kind === 'book' ? target.book.title : target.title;
}

export function getReadwiseOriginalFileTargetKey(target: ReadwiseOriginalFileTarget) {
  return target.kind === 'book' ? target.book.bookKey : target.bookKey;
}

export function getReadwiseOriginalFileDownloadUrl(target: ReadwiseOriginalFileTarget) {
  return target.kind === 'book' ? target.book.downloadUrl : target.downloadUrl;
}
