import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

const READWISE_BOOK_EPUB_PICKER_STATE_KEY = 'readwise_book_epub_picker_state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

export function saveRecentReadwiseBookEpubDirectory(epubPath: string) {
  const lastDirectory = path.dirname(epubPath).trim();
  if (!lastDirectory) {
    return;
  }
  saveJsonSetting(READWISE_BOOK_EPUB_PICKER_STATE_KEY, {
    lastDirectory,
    updatedAt: new Date().toISOString()
  });
}

async function resolveReadwiseBookEpubDialogDefaultPath(book: ReadwiseBookInventoryItem | null) {
  const currentEpubPath = book?.epubPath?.trim() ?? '';
  if (currentEpubPath && (await pathExists(currentEpubPath))) {
    return currentEpubPath;
  }
  const recentDirectory = loadRecentReadwiseBookEpubDirectory();
  return recentDirectory && (await pathExists(recentDirectory)) ? recentDirectory : undefined;
}

export async function selectReadwiseBookEpubPath(book: ReadwiseBookInventoryItem | null, window: BrowserWindow | null) {
  const defaultPath = await resolveReadwiseBookEpubDialogDefaultPath(book);
  const dialogOptions = {
    ...(defaultPath ? { defaultPath } : {}),
    filters: [{ extensions: ['epub', 'pdf'], name: 'Original file' }],
    properties: ['openFile']
  } satisfies Parameters<typeof dialog.showOpenDialog>[0];
  const selection = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  return selection.canceled || selection.filePaths.length === 0 || !selection.filePaths[0]?.trim()
    ? null
    : selection.filePaths[0].trim();
}
