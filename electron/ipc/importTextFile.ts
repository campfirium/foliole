import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { ImportHighlightPolicy, PersistedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { applyImportHighlightPolicy } from '../../lib/core/import/highlightPolicy.js';
import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';
import type {
  NativeImportedTextFile,
  NativeTextImportArgs,
  NativeTextImportResult
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';

const IMPORTABLE_TEXT_EXTENSIONS = new Set(['.htm', '.html', '.md', '.markdown', '.txt']);

function resolveImportKind(filePath: string): NativeImportedTextFile['kind'] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.htm' || extension === '.html') {
    return 'html';
  }
  if (extension === '.txt') {
    return 'text';
  }
  if (IMPORTABLE_TEXT_EXTENSIONS.has(extension)) {
    return 'markdown';
  }
  throw new Error(`unsupported import file extension: ${extension || '(none)'}`);
}

function stripUtf8Bom(content: string) {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

function resolveImportHighlightPolicy(args?: NativeTextImportArgs): ImportHighlightPolicy {
  return args?.highlight_policy === 'adopt' ? 'adopt' : 'reference_only';
}

function toImportPayload(content: string, kind: NativeImportedTextFile['kind']) {
  const normalizedContent = stripUtf8Bom(content);
  if (kind !== 'html') {
    return { content: normalizedContent, degradedReason: null };
  }
  const converted = convertHtmlToMarkdownCompatible(normalizedContent);
  return {
    content: converted.content,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings)
  };
}

function toNativeTextImportResult(record: PersistedImportRecord): NativeTextImportResult {
  return {
    content_fingerprint: record.contentFingerprint,
    degraded_reason: record.degradedReason,
    duplicate_semantic: record.duplicateSemantic,
    failure_reason: record.failureReason,
    import_id: record.importId,
    imported_at: record.importedAt,
    node_id: record.nodeId,
    provider: record.provider,
    result_status: record.resultStatus,
    source_fingerprint: record.sourceFingerprint,
    source_kind: record.sourceKind,
    source_locator: record.sourceLocator,
    source_name: record.sourceName
  };
}

async function selectImportFilePath(window?: BrowserWindow | null) {
  const selection = window
    ? await dialog.showOpenDialog(window, {
        filters: [{ name: 'Markdown / HTML / Text', extensions: ['md', 'markdown', 'html', 'htm', 'txt'] }],
        properties: ['openFile']
      })
    : await dialog.showOpenDialog({
        filters: [{ name: 'Markdown / HTML / Text', extensions: ['md', 'markdown', 'html', 'htm', 'txt'] }],
        properties: ['openFile']
      });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
}

export async function selectImportTextFile(
  window?: BrowserWindow | null,
  args?: NativeTextImportArgs
): Promise<NativeImportedTextFile | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }
  const kind = resolveImportKind(filePath);
  const { content } = toImportPayload(await fs.readFile(filePath, 'utf8'), kind);
  const highlightPolicy = resolveImportHighlightPolicy(args);

  return {
    content: applyImportHighlightPolicy(content, highlightPolicy),
    file_name: path.basename(filePath),
    file_path: filePath,
    kind
  };
}

export async function runTextFileImport(
  window?: BrowserWindow | null,
  args?: NativeTextImportArgs
): Promise<NativeTextImportResult | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }

  const fileName = path.basename(filePath);
  const importedAt = new Date().toISOString();
  const kind = resolveImportKind(filePath);
  const highlightPolicy = resolveImportHighlightPolicy(args);

  try {
    const { content, degradedReason } = toImportPayload(await fs.readFile(filePath, 'utf8'), kind);
    return toNativeTextImportResult(
      runPreparedImport(
        createPreparedDesktopTextImport({
          content,
          degradedReason,
          fileName,
          filePath,
          highlightPolicy,
          importedAt,
          kind
        })
      )
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    return toNativeTextImportResult(
      recordPreparedImportFailure(
        createPreparedDesktopTextImport({ content: '', fileName, filePath, highlightPolicy, importedAt, kind }),
        failureReason
      )
    );
  }
}
