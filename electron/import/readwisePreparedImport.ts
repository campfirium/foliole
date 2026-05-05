import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { loadPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

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
    const articleMarkdown = await fs.readFile(articlePath, 'utf8');
    return loadPreparedImportRecord(source, {
      highlightPolicy: options.highlightPolicy,
      highlightSidecar: extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig),
      importedAt: options.importedAt,
      sourceProfile: 'body_with_highlight_sidecar'
    });
  } catch {
    return loadPreparedImportRecord(source, {
      highlightPolicy: options.highlightPolicy,
      importedAt: options.importedAt
    });
  }
}
