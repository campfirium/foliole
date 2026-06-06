import path from 'node:path';

import type { AppPaths } from './paths.js';

const DANGEROUS_LOCAL_OPEN_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.exe',
  '.hta',
  '.jar',
  '.js',
  '.jse',
  '.lnk',
  '.msc',
  '.msi',
  '.ps1',
  '.reg',
  '.scr',
  '.sh',
  '.url',
  '.vbe',
  '.vbs',
  '.wsf',
  '.wsh'
]);

function isNetworkPath(targetPath: string) {
  return targetPath.startsWith('\\\\') || targetPath.startsWith('//');
}

function isUrlLike(targetPath: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(targetPath);
}

function usesWindowsPathSyntax(targetPath: string) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.includes('\\');
}

function normalizeLocalPath(targetPath: string) {
  return usesWindowsPathSyntax(targetPath)
    ? path.win32.normalize(targetPath)
    : path.normalize(targetPath);
}

function isAbsoluteLocalPath(targetPath: string) {
  return path.isAbsolute(targetPath) || path.win32.isAbsolute(targetPath);
}

function normalizeComparablePath(targetPath: string) {
  const normalizedPath = normalizeLocalPath(targetPath);
  return usesWindowsPathSyntax(normalizedPath) ? normalizedPath.toLowerCase() : normalizedPath;
}

function isSameOrNestedPath(targetPath: string, allowedRoot: string) {
  const normalizedTarget = normalizeComparablePath(targetPath);
  const normalizedRoot = normalizeComparablePath(allowedRoot);
  if (normalizedTarget === normalizedRoot) {
    return true;
  }
  const separator = usesWindowsPathSyntax(normalizedRoot) ? '\\' : path.sep;
  return normalizedTarget.startsWith(`${normalizedRoot}${separator}`);
}

function resolveAllowedAppManagedDirs(appPaths: AppPaths) {
  return [
    appPaths.app_log_dir,
    appPaths.app_data_dir,
    appPaths.app_config_dir,
    appPaths.app_cache_dir
  ].filter((value) => value.trim().length > 0);
}

export function resolveAllowedLocalOpenPath(targetPath: string, appPaths: AppPaths) {
  const trimmedPath = targetPath.trim();
  if (!trimmedPath || isNetworkPath(trimmedPath) || isUrlLike(trimmedPath)) {
    return null;
  }
  const normalizedPath = normalizeLocalPath(trimmedPath);
  if (!isAbsoluteLocalPath(normalizedPath)) {
    return null;
  }
  const extension = path.extname(normalizedPath).toLowerCase();
  if (extension) {
    return DANGEROUS_LOCAL_OPEN_EXTENSIONS.has(extension) ? null : normalizedPath;
  }
  return resolveAllowedAppManagedDirs(appPaths).some((allowedDir) => isSameOrNestedPath(normalizedPath, allowedDir))
    ? normalizedPath
    : null;
}
