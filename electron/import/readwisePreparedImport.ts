import fs from 'node:fs/promises';
import path from 'node:path';

import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { extractReadwiseSidecarHighlights, transformReadwiseFullDocument } from '../../lib/core/import/readwiseReaderParsing.js';
import {
  resolveReadwiseImportDestination,
  type ReadwiseReaderConfig,
  type ReadwiseWithoutHighlightsDestination
} from '../../lib/core/import/readwiseReaderSettings.js';
import { buildPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

export interface ReadwiseSourceSignature {
  highlight: { mtimeMs: number; sizeBytes: number } | null;
  primary: { mtimeMs: number; sizeBytes: number };
}

export interface ReadwiseSourceImportDecision {
  destination: ReadwiseWithoutHighlightsDestination;
  detectedHighlightCount: number;
  hasHighlights: boolean;
}

function buildReadwiseSourceIdentity(kind: ReadwiseSourceKind, sourceName: string) {
  const normalizedSourceName = sourceName.replace(/\\/g, '/');
  return `readwise/${kind}/${normalizedSourceName}`;
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

export async function resolveReadwiseSourceImportDecision(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  let detectedHighlightCount = 0;
  try {
    const articleMarkdown = await fs.readFile(articlePath, 'utf8');
    detectedHighlightCount = extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig).length;
  } catch {
    detectedHighlightCount = 0;
  }
  const hasHighlights = detectedHighlightCount > 0;
  return {
    destination: resolveReadwiseImportDestination(options.readwiseConfig, hasHighlights),
    detectedHighlightCount,
    hasHighlights
  };
}

export async function shouldImportReadwiseSource(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  const decision = await resolveReadwiseSourceImportDecision(source, options);
  return decision.destination !== 'off';
}

export async function loadPreparedReadwiseImportRecord(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    highlightPolicy: 'adopt' | 'reference_only';
    importedAt: string;
    kind: ReadwiseSourceKind;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  const sourceIdentity = buildReadwiseSourceIdentity(options.kind, source.sourceName);
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
      sourceIdentity,
      sourceLocator: source.filePath,
      sourceProfile: 'body_with_highlight_sidecar'
    });
  } catch {
    const fullDocumentMarkdown = await fs.readFile(source.filePath, 'utf8');
    return buildPreparedImportRecord(source, {
      content: transformReadwiseFullDocument(fullDocumentMarkdown),
      highlightPolicy: options.highlightPolicy,
      importedAt: options.importedAt,
      sourceIdentity,
      sourceLocator: source.filePath
    });
  }
}
