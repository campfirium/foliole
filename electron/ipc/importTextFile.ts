import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import type { NativeImportedTextFile, NativeTextImportResult } from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';

const IMPORTABLE_TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

function resolveImportKind(filePath: string): NativeImportedTextFile['kind'] {
  const extension = path.extname(filePath).toLowerCase();
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
        filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }],
        properties: ['openFile']
      })
    : await dialog.showOpenDialog({
        filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }],
        properties: ['openFile']
      });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
}

export async function selectImportTextFile(window?: BrowserWindow | null): Promise<NativeImportedTextFile | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }
  const content = stripUtf8Bom(await fs.readFile(filePath, 'utf8'));

  return {
    content,
    file_name: path.basename(filePath),
    file_path: filePath,
    kind: resolveImportKind(filePath)
  };
}

export async function runTextFileImport(window?: BrowserWindow | null): Promise<NativeTextImportResult | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }

  const fileName = path.basename(filePath);
  const importedAt = new Date().toISOString();
  const kind = resolveImportKind(filePath);

  try {
    const content = stripUtf8Bom(await fs.readFile(filePath, 'utf8'));
    return toNativeTextImportResult(
      runPreparedImport(
        createPreparedDesktopTextImport({ content, fileName, filePath, importedAt, kind })
      )
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    return toNativeTextImportResult(
      recordPreparedImportFailure(
        createPreparedDesktopTextImport({ content: '', fileName, filePath, importedAt, kind }),
        failureReason
      )
    );
  }
}
