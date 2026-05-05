import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReadwiseSidecarHighlights, transformReadwiseFullDocument } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { buildPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

export interface ReadwiseSourceSignature {
  highlight: { mtimeMs: number; sizeBytes: number } | null;
  primary: { mtimeMs: number; sizeBytes: number };
}

export async function resolveReadwiseSourceSignature(
  source: DirectoryImportSourceDescriptor,
  options: { highlightDirectoryPath: string }
): Promise<ReadwiseSourceSignature> {
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  try {
    const articleStats = await fs.stat(articlePath);
    return {
      highlight: {
        mtimeMs: articleStats.mtimeMs,
        sizeBytes: articleStats.size
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

export async function shouldImportReadwiseSource(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  if (options.readwiseConfig.importScope === 'all') {
    return true;
  }
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  try {
    const articleMarkdown = await fs.readFile(articlePath, 'utf8');
    return extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig).length > 0;
  } catch {
    return false;
  }
}

export async function loadPreparedReadwiseImportRecord(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    highlightPolicy: 'adopt' | 'reference_only';
    importedAt: string;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  try {
    const [articleMarkdown, fullDocumentMarkdown] = await Promise.all([
      fs.readFile(articlePath, 'utf8'),
      fs.readFile(source.filePath, 'utf8')
    ]);
    return buildPreparedImportRecord(source, {
      content: transformReadwiseFullDocument(fullDocumentMarkdown, articleMarkdown),
      highlightPolicy: options.highlightPolicy,
      highlightSidecar: extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig),
      importedAt: options.importedAt,
      sourceProfile: 'body_with_highlight_sidecar'
    });
  } catch {
    const fullDocumentMarkdown = await fs.readFile(source.filePath, 'utf8');
    return buildPreparedImportRecord(source, {
      content: transformReadwiseFullDocument(fullDocumentMarkdown),
      highlightPolicy: options.highlightPolicy,
      importedAt: options.importedAt
    });
  }
}
