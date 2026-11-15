import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeSuperMemoSource } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { persistSecurityScopedBookmark, shouldRequestSecurityScopedBookmarks } from '../securityScopedBookmarks.js';

import {
  assertAuthorizedImportFilePath, authorizeSelectedImportDirectoryPath, authorizeSelectedImportFilePath
} from './importPathAuthorization.js';

const MAX_XML_BYTES = 128 * 1024 * 1024;

async function directoryExists(directory: string) {
  try {
    return (await lstat(directory)).isDirectory();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectionForExport(xmlPath: string) {
  const directory = path.dirname(xmlPath);
  if (await directoryExists(path.join(directory, 'info'))) return directory;
  const stem = path.basename(xmlPath, path.extname(xmlPath)).replace(/\s*\(all elements\)$/iu, '');
  if (!stem || stem === '.' || stem === '..') return undefined;
  const sibling = path.join(directory, stem);
  return await directoryExists(sibling) && await directoryExists(path.join(sibling, 'info')) ? sibling : undefined;
}

export async function readSuperMemoSource(filePath: string): Promise<NativeSuperMemoSource> {
  const xmlPath = await assertAuthorizedImportFilePath(filePath);
  if (path.extname(xmlPath).toLowerCase() !== '.xml') throw new Error('invalid_supermemo_xml_path');
  const file = await open(xmlPath, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_XML_BYTES) throw new Error('invalid_supermemo_xml_size');
    const bytes = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== bytes.length || (await file.stat()).size !== stat.size) throw new Error('supermemo_source_changed');
    const collectionDirectory = await collectionForExport(xmlPath);
    if (collectionDirectory) await authorizeSelectedImportDirectoryPath(collectionDirectory);
    return { filePath: xmlPath, name: path.basename(xmlPath), xml: bytes.toString('utf8'), collectionDirectory };
  } finally {
    await file.close();
  }
}

export async function selectSuperMemoSource(window: BrowserWindow | null) {
  const options = {
    properties: ['openFile' as const],
    filters: [{ name: 'SuperMemo XML', extensions: ['xml'] }],
    securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
  };
  const selection = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const filePath = selection.filePaths[0];
  if (selection.canceled || !filePath) return null;
  persistSecurityScopedBookmark(filePath, selection.bookmarks?.[0]);
  await authorizeSelectedImportFilePath(filePath);
  return readSuperMemoSource(filePath);
}
