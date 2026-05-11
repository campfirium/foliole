import path from 'node:path';

import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

export interface ExternalSearchScanRuntime {
  autoExcludedPaths: string[];
  processedCount: number;
  yieldEvery: number;
}

export function normalizeExternalSearchPath(value: string) {
  return path.resolve(value).replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

export function isInsideExcludedExternalSearchPath(currentPath: string, excludedPath: string) {
  const current = normalizeExternalSearchPath(currentPath);
  const excluded = normalizeExternalSearchPath(excludedPath);
  return current === excluded || current.startsWith(`${excluded}/`);
}

function normalizeSegments(values: string[]) {
  return new Set(values.map((value) => value.trim().replace(/\\/g, '/')).filter(Boolean));
}

export function createExternalSearchScanRuntime(autoExcludedPaths: string[] = []) {
  return {
    autoExcludedPaths: autoExcludedPaths.filter((value) => value.trim().length > 0),
    processedCount: 0,
    yieldEvery: 25
  } satisfies ExternalSearchScanRuntime;
}

export async function yieldExternalSearchScanWork(runtime: ExternalSearchScanRuntime) {
  runtime.processedCount += 1;
  if (runtime.processedCount % runtime.yieldEvery !== 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function shouldSkipExternalSearchDirectory(args: {
  autoExcludedPaths: string[];
  currentPath: string;
  defaultExcludedNames: Set<string>;
  folder: NativeExternalSearchFolder;
  relativeDirectoryPath: string;
}) {
  if (args.autoExcludedPaths.some((excludedPath) => isInsideExcludedExternalSearchPath(args.currentPath, excludedPath))) {
    return true;
  }
  const normalizedRelative = args.relativeDirectoryPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalizedRelative) return false;
  const excludedSegments = normalizeSegments(args.folder.excluded_dirs);
  return normalizedRelative.split('/').some((segment) => excludedSegments.has(normalizedRelative) || excludedSegments.has(segment) || args.defaultExcludedNames.has(segment));
}
