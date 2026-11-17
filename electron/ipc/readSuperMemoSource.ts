import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeSuperMemoSource } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { persistSecurityScopedBookmark, shouldRequestSecurityScopedBookmarks } from '../securityScopedBookmarks.js';

import { isImportAccessDenied, rethrowImportAccessError } from './importAccessError.js';
import {
  assertAuthorizedImportDirectoryPath, assertAuthorizedImportFilePath, authorizeSelectedImportDirectoryPath, authorizeSelectedImportFilePath
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

export async function readSuperMemoSource(filePath: string, collectionChoice?: string | null): Promise<NativeSuperMemoSource> {
  return readSource(filePath, collectionChoice).catch(rethrowImportAccessError);
}

async function resolveCollection(xmlPath: string, choice?: string | null) {
  if (choice === null) return {};
  if (choice !== undefined) {
    try {
      return { collectionDirectory: await assertAuthorizedImportDirectoryPath(choice) };
    } catch (error) {
      throw new Error(isImportAccessDenied(error) ? 'supermemo_collection_access_denied' : 'supermemo_collection_unreadable', { cause: error });
    }
  }
  try {
    const collectionDirectory = await collectionForExport(xmlPath);
    if (collectionDirectory) {
      await authorizeSelectedImportDirectoryPath(collectionDirectory);
      return { collectionDirectory };
    }
    return { collectionCandidates: await collectionsAt(path.dirname(xmlPath)) };
  } catch (error) {
    return { collectionDiscoveryFailure: isImportAccessDenied(error) ? 'access' as const : 'read' as const };
  }
}

async function readSource(filePath: string, collectionChoice?: string | null): Promise<NativeSuperMemoSource> {
  const xmlPath = await assertAuthorizedImportFilePath(filePath);
  if (path.extname(xmlPath).toLowerCase() !== '.xml') throw new Error('invalid_supermemo_xml_path');
  const file = await open(xmlPath, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_XML_BYTES) throw new Error('invalid_supermemo_xml_size');
    const bytes = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== bytes.length || (await file.stat()).size !== stat.size) throw new Error('supermemo_source_changed');
    const collection = await resolveCollection(xmlPath, collectionChoice);
    return { filePath: xmlPath, name: path.basename(xmlPath), xml: bytes.toString('utf8'),
      collectionDirectory: undefined, ...collection };
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
  await authorizeSelectedImportFilePath(filePath).catch(rethrowImportAccessError);
  return readSuperMemoSource(filePath);
}

async function collectionsAt(location: string) {
  if (await directoryExists(path.join(location, 'info')).catch(() => false)) {
    await authorizeSelectedImportDirectoryPath(location);
    return [{ directory: location, name: path.basename(location) }];
  }
  const entries = await readdir(location, { withFileTypes: true });
  const roots = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(location, entry.name));
  const candidates = [];
  for (const directory of roots) {
    if (!await directoryExists(path.join(directory, 'info')).catch(() => false)) continue;
    await authorizeSelectedImportDirectoryPath(directory);
    candidates.push({ directory, name: path.basename(directory) });
  }
  return candidates;
}

export async function selectSuperMemoCollection(window: BrowserWindow | null, filePath: string, title: string, candidate?: string) {
  const xml = await assertAuthorizedImportFilePath(filePath);
  const initial = candidate ? await assertAuthorizedImportDirectoryPath(candidate).catch(() => undefined) : undefined;
  const options = {
    title, defaultPath: initial ?? path.dirname(xml), properties: ['openDirectory' as const],
    securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
  };
  const selection = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const location = selection.filePaths[0];
  if (selection.canceled || !location) return null;
  persistSecurityScopedBookmark(location, selection.bookmarks?.[0]);
  await authorizeSelectedImportDirectoryPath(location);
  return collectionsAt(await assertAuthorizedImportDirectoryPath(location)).catch(rethrowImportAccessError);
}
