import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import { extractGenericSidecarHighlights } from '../../lib/core/import/genericHighlightSidecarParsing.js';
import type { ImportNodeTitleStrategy } from '../../lib/core/import/importManagerSettings.js';
import { loadPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

export interface GenericSplitSourceSignature {
  highlight: { mtimeMs: number; sizeBytes: number } | null;
  primary: { mtimeMs: number; sizeBytes: number };
}

async function readHighlightSidecar(filePath: string) {
  try {
    return extractGenericSidecarHighlights(await fs.readFile(filePath, 'utf8'));
  } catch {
    return [];
  }
}

export function resolveGenericSplitHighlightPath(source: DirectoryImportSourceDescriptor, highlightDirectoryPath: string) {
  return path.join(highlightDirectoryPath, source.sourceName);
}

export async function resolveGenericSplitSourceSignature(
  source: DirectoryImportSourceDescriptor,
  options: { highlightDirectoryPath: string }
): Promise<GenericSplitSourceSignature> {
  const highlightPath = resolveGenericSplitHighlightPath(source, options.highlightDirectoryPath);
  try {
    const highlightStats = await fs.stat(highlightPath);
    return {
      highlight: {
        mtimeMs: highlightStats.mtimeMs,
        sizeBytes: highlightStats.size
      },
      primary: {
        mtimeMs: source.mtimeMs,
        sizeBytes: source.sizeBytes
      }
    };
  } catch {
    return {
      highlight: null,
      primary: {
        mtimeMs: source.mtimeMs,
        sizeBytes: source.sizeBytes
      }
    };
  }
}

export async function loadPreparedGenericSplitImportRecord(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    highlightPolicy: ImportHighlightPolicy;
    importedAt: string;
    titleStrategy: ImportNodeTitleStrategy;
  }
) {
  const highlightSidecar = await readHighlightSidecar(resolveGenericSplitHighlightPath(source, options.highlightDirectoryPath));
  return loadPreparedImportRecord(source, {
    highlightPolicy: options.highlightPolicy,
    highlightSidecar,
    importedAt: options.importedAt,
    titleStrategy: options.titleStrategy
  });
}
