import fs from 'node:fs/promises';
import path from 'node:path';

import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { parseReadwiseFullDocumentImport } from '../../lib/core/import/readwiseFullDocumentParsing.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import {
  resolveReadwiseImportDestination,
  type ReadwiseReaderConfig,
  type ReadwiseWithoutHighlightsDestination
} from '../../lib/core/import/readwiseReaderSettings.js';
import { buildPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { ImageLocalizationContext } from './imageLocalizationContext.js';

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

function appendDegradedReason(...reasons: Array<string | null | undefined>) {
  const collected = reasons.map((reason) => reason?.trim()).filter((reason): reason is string => Boolean(reason));
  return collected.length > 0 ? Array.from(new Set(collected)).join('; ') : null;
}

async function localizeReadwiseMarkdownPair(input: {
  articleMarkdown?: string;
  fullDocumentMarkdown: string;
}) {
  const context = new ImageLocalizationContext();
  const fullDocument = await context.localizeMarkdown(input.fullDocumentMarkdown);
  const article = input.articleMarkdown ? await context.localizeMarkdown(input.articleMarkdown) : null;
  return {
    articleMarkdown: article?.text,
    attachmentIds: [...new Set([...fullDocument.attachmentIds, ...(article?.attachmentIds ?? [])])],
    degradedReason: appendDegradedReason(
      ...fullDocument.degradedMessages.map((message) => `Readwise image localization degraded: ${message}`),
      ...(article?.degradedMessages.map((message) => `Readwise image localization degraded: ${message}`) ?? [])
    ),
    fullDocumentMarkdown: fullDocument.text
  };
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
    const localized = await localizeReadwiseMarkdownPair({ articleMarkdown, fullDocumentMarkdown });
    const parsedFullDocument = parseReadwiseFullDocumentImport(localized.fullDocumentMarkdown);
    return {
      ...buildPreparedImportRecord(source, {
        content: parsedFullDocument.content,
        degradedReason: localized.degradedReason,
        highlightPolicy: options.highlightPolicy,
        highlightSidecar: extractReadwiseSidecarHighlights(localized.articleMarkdown ?? articleMarkdown, options.readwiseConfig),
        importedAt: options.importedAt,
        nodeTitleOverride: parsedFullDocument.nodeTitle,
        sourceIdentity,
        sourceLocator: source.filePath,
        sourceProfile: 'body_with_highlight_sidecar'
      }),
      localizedImageAttachmentIds: localized.attachmentIds
    };
  } catch {
    const fullDocumentMarkdown = await fs.readFile(source.filePath, 'utf8');
    const localized = await localizeReadwiseMarkdownPair({ fullDocumentMarkdown });
    const parsedFullDocument = parseReadwiseFullDocumentImport(localized.fullDocumentMarkdown);
    return {
      ...buildPreparedImportRecord(source, {
        content: parsedFullDocument.content,
        degradedReason: localized.degradedReason,
        highlightPolicy: options.highlightPolicy,
        importedAt: options.importedAt,
        nodeTitleOverride: parsedFullDocument.nodeTitle,
        sourceIdentity,
        sourceLocator: source.filePath
      }),
      localizedImageAttachmentIds: localized.attachmentIds
    };
  }
}
