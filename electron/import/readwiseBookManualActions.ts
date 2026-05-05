import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, shell, type BrowserWindow } from 'electron';

import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { runEpubImport } from '../ipc/epubImport.js';
import { resolveSingleFileImportSource } from '../ipc/importSourcePipeline.js';

import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { loadReadwiseBooksInventory, type ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';
import {
  findPersistedReadwiseBookByNodeId,
  savePersistedReadwiseBooksInventory
} from './readwiseBooksInventoryState.js';

const PREFERRED_DOWNLOAD_METADATA_KEYS = [
  'epub_download_url',
  'download_url',
  'epub_url',
  'book_download_url',
  'book_url',
  'source_url',
  'url'
];
const READWISE_BOOK_EPUB_PICKER_STATE_KEY = 'readwise_book_epub_picker_state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}
function normalizeMetadataKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseMetadataEntries(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const match = /^## Metadata[^\n]*\n([\s\S]*?)(?=^## |\s*$)/im.exec(normalized);
  if (!match) {
    return [] as Array<{ key: string; value: string }>;
  }
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const entry = /^-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!entry) {
        return [];
      }
      const key = normalizeMetadataKey(entry[1]);
      const value = entry[2].trim();
      return key && value ? [{ key, value }] : [];
    });
}
function extractUrl(value: string) {
  const markdownLinkMatch = /\((https?:\/\/[^)\s]+)\)/i.exec(value);
  if (markdownLinkMatch?.[1]) {
    return markdownLinkMatch[1];
  }
  const directMatch = /(https?:\/\/\S+)/i.exec(value);
  return directMatch?.[1] ?? null;
}

async function pathExists(targetPath: string) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function loadRecentReadwiseBookEpubDirectory() {
  const saved = loadJsonSetting(READWISE_BOOK_EPUB_PICKER_STATE_KEY);
  if (!isRecord(saved) || typeof saved.lastDirectory !== 'string') {
    return '';
  }
  return saved.lastDirectory.trim();
}
function saveRecentReadwiseBookEpubDirectory(epubPath: string) {
  const lastDirectory = path.dirname(epubPath).trim();
  if (!lastDirectory) {
    return;
  }
  saveJsonSetting(READWISE_BOOK_EPUB_PICKER_STATE_KEY, {
    lastDirectory,
    updatedAt: new Date().toISOString()
  });
}
async function resolveReadwiseBookEpubDialogDefaultPath(book: ReadwiseBookInventoryItem) {
  const currentEpubPath = book.epubPath?.trim() ?? '';
  if (currentEpubPath && (await pathExists(currentEpubPath))) {
    return currentEpubPath;
  }

  const recentDirectory = loadRecentReadwiseBookEpubDirectory();
  if (recentDirectory && (await pathExists(recentDirectory))) {
    return recentDirectory;
  }

  return undefined;
}
async function readBookDownloadUrl(book: ReadwiseBookInventoryItem) {
  for (const sourcePath of [book.fullDocumentMarkdownPath, book.highlightMarkdownPath]) {
    if (!sourcePath) {
      continue;
    }
    try {
      const markdown = await fs.readFile(sourcePath, 'utf8');
      const metadataEntries = parseMetadataEntries(markdown);
      for (const preferredKey of PREFERRED_DOWNLOAD_METADATA_KEYS) {
        const matchedEntry = metadataEntries.find((entry) => entry.key === preferredKey);
        const url = matchedEntry ? extractUrl(matchedEntry.value) : null;
        if (url) {
          return url;
        }
      }
      for (const entry of metadataEntries) {
        const url = extractUrl(entry.value);
        if (url) {
          return url;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function loadBookByNodeId(nodeId: string) {
  const inventory = await loadReadwiseBooksInventory();
  const book =
    inventory.books.find(
      (candidate) =>
        candidate.generatedNodeId === nodeId || buildReadwiseBookPlaceholderNodeId(candidate.bookKey) === nodeId
    ) ?? null;
  if (book) {
    return { book, inventory };
  }
  return findPersistedReadwiseBookByNodeId(nodeId) ?? { book: null, inventory };
}

function refreshPlaceholderNode(book: ReadwiseBookInventoryItem) {
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  if (book.generatedNodeId !== placeholderNodeId) {
    return;
  }
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(buildReadwiseBookPlaceholderContent(book), new Date().toISOString(), placeholderNodeId);
}

export async function openReadwiseBookDownload(nodeId: string): Promise<NativeReadwiseBookDownloadResult> {
  const { book } = await loadBookByNodeId(nodeId);
  if (!book) {
    return { book_key: null, status: 'book_not_found', title: null, url: null };
  }

  const url = await readBookDownloadUrl(book);
  if (!url) {
    return { book_key: book.bookKey, status: 'missing_link', title: book.title, url: null };
  }

  await shell.openExternal(url);
  return { book_key: book.bookKey, status: 'opened', title: book.title, url };
}

export async function loadReadwiseBookEpub(
  nodeId: string,
  window: BrowserWindow | null = null
): Promise<NativeReadwiseBookEpubLoadResult> {
  const { book, inventory } = await loadBookByNodeId(nodeId);
  if (!book) {
    return { book_key: null, epub_path: null, status: 'book_not_found', title: null };
  }

  const defaultPath = await resolveReadwiseBookEpubDialogDefaultPath(book);
  const dialogOptions = {
    ...(defaultPath ? { defaultPath } : {}),
    filters: [{ extensions: ['epub'], name: 'EPUB' }],
    properties: ['openFile']
  } satisfies Parameters<typeof dialog.showOpenDialog>[0];

  const selection = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (selection.canceled || selection.filePaths.length === 0 || !selection.filePaths[0]?.trim()) {
    return { book_key: book.bookKey, epub_path: null, status: 'cancelled', title: book.title };
  }

  const epubPath = selection.filePaths[0].trim();
  saveRecentReadwiseBookEpubDirectory(epubPath);
  const imported = await runEpubImport(resolveSingleFileImportSource(epubPath), new Date().toISOString());
  const generatedNodeId = imported.nodeId ?? book.generatedNodeId;
  const updatedBook = {
    ...book,
    epubPath,
    epubStatus: 'received',
    generatedNodeId,
    importStatus: generatedNodeId ? 'completed' : book.importStatus,
    nodeStatus: generatedNodeId ? 'generated' : book.nodeStatus
  } satisfies ReadwiseBookInventoryItem;
  const updatedInventory = {
    ...inventory,
    books: inventory.books.map((candidate) => (candidate.bookKey === book.bookKey ? updatedBook : candidate)),
    scannedAt: new Date().toISOString()
  };

  savePersistedReadwiseBooksInventory(updatedInventory);
  refreshPlaceholderNode(updatedBook);

  return { book_key: updatedBook.bookKey, epub_path: updatedBook.epubPath, status: 'selected', title: updatedBook.title };
}
