import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import { resolveDesktopSourceAddress } from '../database/desktopSources.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';
import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';

interface ReadwiseTopicMergeSource {
  descriptor: DirectoryImportSourceDescriptor;
  readwiseSource: ImportManagerSourceDraft & { kind: NonNullable<ImportManagerSourceDraft['kind']> };
  sourceNodeId: string;
}

function resolveReadwiseSourceByRef(sourceRef: string) {
  const settings = loadImportManagerSettings();
  return (
    settings.readwiseSources.find(
      (entry): entry is ReadwiseTopicMergeSource['readwiseSource'] =>
        Boolean(entry.kind) &&
        entry.highlightMode === 'split' &&
        Boolean(entry.highlightPath.trim()) &&
        Boolean(entry.primaryPath.trim()) &&
        sourceRef === `readwise:${entry.id}`
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
  const sourceRef = details?.importSource?.source_ref?.trim();
  const location = details?.importSource?.source_location?.trim();
  const sourceName = details?.importSource?.source_name;
  if (!details || !sourceRef || !location || !sourceName) {
    return null;
  }

  const readwiseSource = resolveReadwiseSourceByRef(sourceRef);
  if (!readwiseSource) {
    return null;
  }
  const currentAddress = resolveDesktopSourceAddress(sourceRef, location);
  if (!currentAddress) return null;

  const descriptor = await buildSourceDescriptor(
    currentAddress,
    readwiseSource,
    sourceName
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
