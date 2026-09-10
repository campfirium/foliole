import fs from 'node:fs/promises';
import path from 'node:path';

import { appendFilePlaceholderHighlights } from '../../lib/core/import/filePlaceholderContent.js';
import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import {
  resolveReadwiseAutoImportDestination,
  type ReadwiseAutoImportPolicy
} from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { parseReadwiseFullDocumentImport } from '../../lib/core/import/readwiseFullDocumentParsing.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { buildPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

export interface ReadwiseSourceSignature {
  highlight: { mtimeMs: number; sizeBytes: number } | null;
  primary: { mtimeMs: number; sizeBytes: number };
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
    kind: ReadwiseSourceKind;
    policy: ReadwiseAutoImportPolicy;
    readwiseConfig: ReadwiseReaderConfig;
  }
) {
  const articlePath = path.join(options.highlightDirectoryPath, source.sourceName);
  let detectedHighlightCount = 0;
  let hasHighlightFile = false;
  try {
    const articleMarkdown = await fs.readFile(articlePath, 'utf8');
    hasHighlightFile = true;
    detectedHighlightCount = extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig).length;
  } catch {
    detectedHighlightCount = 0;
  }
  const hasHighlights = detectedHighlightCount > 0;
  return {
    destination: resolveReadwiseAutoImportDestination(
      options.policy,
      options.kind === 'books' ? 'epub' : 'article',
      hasHighlights
    ),
    detectedHighlightCount,
    hasHighlightFile,
    hasHighlights
  };
}

export async function shouldImportReadwiseSource(
  source: DirectoryImportSourceDescriptor,
  options: {
    highlightDirectoryPath: string;
    kind: ReadwiseSourceKind;
    policy: ReadwiseAutoImportPolicy;
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
    const parsedFullDocument = parseReadwiseFullDocumentImport(fullDocumentMarkdown);
    const highlightSidecar = extractReadwiseSidecarHighlights(articleMarkdown, options.readwiseConfig);
    return buildPreparedImportRecord(source, {
      content: appendFilePlaceholderHighlights(parsedFullDocument.content, highlightSidecar, {
        summary: parsedFullDocument.summary
      }),
      highlightPolicy: options.highlightPolicy,
      highlightSidecar,
      hideTitleHeadingOverride: false,
      importedAt: options.importedAt,
      nodeTitleOverride: parsedFullDocument.nodeTitle,
      sourceIdentity,
      sourceLocator: source.filePath,
      sourceProfile: 'body_with_highlight_sidecar'
    });
  } catch {
    const fullDocumentMarkdown = await fs.readFile(source.filePath, 'utf8');
    const parsedFullDocument = parseReadwiseFullDocumentImport(fullDocumentMarkdown);
    return buildPreparedImportRecord(source, {
      content: appendFilePlaceholderHighlights(parsedFullDocument.content, [], {
        summary: parsedFullDocument.summary
      }),
      highlightPolicy: options.highlightPolicy,
      hideTitleHeadingOverride: false,
      importedAt: options.importedAt,
      nodeTitleOverride: parsedFullDocument.nodeTitle,
      sourceIdentity,
      sourceLocator: source.filePath
    });
  }
}
