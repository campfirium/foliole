import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';
import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';

interface ReadwiseTopicMergeSource {
  descriptor: DirectoryImportSourceDescriptor;
  readwiseSource: ImportManagerSourceDraft & { kind: NonNullable<ImportManagerSourceDraft['kind']> };
  sourceNodeId: string;
}

function normalizePath(value: string) {
  return path.normalize(value.trim());
}

function isPathWithinDirectory(filePath: string, directoryPath: string) {
  const normalizedFilePath = normalizePath(filePath);
  const normalizedDirectoryPath = normalizePath(directoryPath);
  if (!normalizedFilePath || !normalizedDirectoryPath) {
    return false;
  }
  const relativePath = path.relative(normalizedDirectoryPath, normalizedFilePath);
  return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function resolveReadwiseSourceByLocator(sourceLocator: string) {
  const settings = loadImportManagerSettings();
  return (
    settings.readwiseSources.find(
      (entry): entry is ReadwiseTopicMergeSource['readwiseSource'] =>
        Boolean(entry.kind) &&
        entry.highlightMode === 'split' &&
        Boolean(entry.highlightPath.trim()) &&
        Boolean(entry.primaryPath.trim()) &&
        isPathWithinDirectory(sourceLocator, entry.primaryPath)
    ) ?? null
  );
}

async function buildSourceDescriptor(
  sourceLocator: string,
  readwiseSource: ReadwiseTopicMergeSource['readwiseSource'],
  sourceName: string
): Promise<DirectoryImportSourceDescriptor | null> {
  try {
    const stats = await fs.stat(sourceLocator);
    const kind = resolveImportKind(sourceLocator);
    const relativeSourceName = path.relative(readwiseSource.primaryPath, sourceLocator);
    return {
      adapterId: kind === 'html' ? 'html_directory' : kind === 'text' ? 'text_directory' : 'markdown_directory',
      filePath: sourceLocator,
      kind,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
      sourceName:
        relativeSourceName && !relativeSourceName.startsWith('..') && !path.isAbsolute(relativeSourceName)
          ? relativeSourceName
          : sourceName
    };
  } catch {
    return null;
  }
}

export async function resolveReadwiseTopicMergeSource(nodeId: string): Promise<ReadwiseTopicMergeSource | null> {
  const details = loadNodeSourceDetails(nodeId);
  if (!details || !details.importSource?.source_locator.trim()) {
    return null;
  }

  const readwiseSource = resolveReadwiseSourceByLocator(details.importSource.source_locator);
  if (!readwiseSource) {
    return null;
  }

  const descriptor = await buildSourceDescriptor(
    details.importSource.source_locator,
    readwiseSource,
    details.importSource.source_name
  );
  if (!descriptor) {
    return null;
  }

  return {
    descriptor,
    readwiseSource,
    sourceNodeId: details.sourceNodeId
  };
}
