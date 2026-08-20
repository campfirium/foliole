import fs from 'node:fs/promises';
import path from 'node:path';

import { loadExternalSearchFolders } from '../database/externalSearchFolders.js';
import { getLocalFileMetadata } from '../database/localFiles.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

const authorizedImportFileRealPaths = new Set<string>();
const authorizedImportDirectoryRealPaths = new Set<string>();

function isUncOrDevicePath(filePath: string) {
  return filePath.startsWith('\\\\') || filePath.startsWith('//');
}

function isSpecialUnixPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return ['/dev', '/proc', '/sys'].some((specialPath) => normalized === specialPath || normalized.startsWith(`${specialPath}/`));
}

function assertImportPathShape(filePath: string) {
  if (!path.isAbsolute(filePath) || isUncOrDevicePath(filePath) || isSpecialUnixPath(filePath)) {
    throw new Error('Import path is not authorized.');
  }
}

async function resolveRealImportPath(filePath: string) {
  const trimmedPath = filePath.trim();
  assertImportPathShape(trimmedPath);
  const resolvedPath = path.resolve(trimmedPath);
  assertImportPathShape(resolvedPath);
  const realPath = typeof fs.realpath === 'function' ? await fs.realpath(resolvedPath) : resolvedPath;
  assertImportPathShape(realPath);
  return realPath;
}

export async function authorizeSelectedImportFilePath(filePath: string) {
  authorizedImportFileRealPaths.add(await resolveRealImportPath(filePath));
}

export async function authorizeSelectedImportFilePaths(filePaths: readonly string[]) {
  await Promise.all(filePaths.map((filePath) => authorizeSelectedImportFilePath(filePath)));
}

export async function authorizeSelectedImportDirectoryPath(directoryPath: string) {
  authorizedImportDirectoryRealPaths.add(await resolveRealImportPath(directoryPath));
}

export async function assertAuthorizedImportFilePath(filePath: string) {
  const realPath = await resolveRealImportPath(filePath);
  if (!authorizedImportFileRealPaths.has(realPath)) {
    throw new Error('Import file path is not authorized.');
  }
  return realPath;
}

export async function assertAuthorizedImportDirectoryPath(directoryPath: string) {
  const realPath = await resolveRealImportPath(directoryPath);
  if (!authorizedImportDirectoryRealPaths.has(realPath)) {
    throw new Error('Import directory path is not authorized.');
  }
  return realPath;
}

export async function assertExternalSearchImportPath(filePath: string) {
  const realPath = await resolveRealImportPath(filePath);
  const localFile = getLocalFileMetadata(realPath);
  if (localFile && localFile.missingAt === null) {
    return realPath;
  }
  const folders = await Promise.all(loadExternalSearchFolders()
    .filter((folder) => folder.access_mode === 'local' && folder.source_executable)
    .map(async (folder) => resolveRealImportPath(folder.folder_path).catch(() => null)));
  if (!folders.some((folderPath) => folderPath && isSameOrNestedPath(realPath, folderPath))) {
    throw new Error('External search import path is not authorized.');
  }
  return realPath;
}

export function resetImportPathAuthorizationForTests() {
  authorizedImportFileRealPaths.clear();
  authorizedImportDirectoryRealPaths.clear();
}
